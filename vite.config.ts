/// <reference types="node" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { resolve } from 'path';
import { PassThrough } from 'node:stream';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { emitAgentError, emitAgentWarning } from './src/lib/services/agent-event-system';
// Локальный тип middleware-обработчика (аналог connect)
import { IncomingMessage, ServerResponse } from 'http';
type NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void
type FetchBody = Parameters<typeof fetch>[1] extends { body?: infer B } ? B : never;
type NodeRequestInit = RequestInit & { duplex?: 'half' };

// Добавляем локальный STT proxy как Vite-плагин (dev + preview)
function createSttMiddleware(env: Record<string, string | undefined>): NextHandleFunction {
  const OPENAI_API_KEY =
    (env.OPENAI_API_KEY as string) ||
    process.env.OPENAI_API_KEY ||
    (env.VITE_OPENAI_API_KEY as string) ||
    process.env.VITE_OPENAI_API_KEY ||
    '';
  const STT_MAX_BYTES = Number(
    (env.STT_MAX_BYTES as string) ||
    process.env.STT_MAX_BYTES ||
    15 * 1024 * 1024
  ); // 15MB по умолчанию
  const STT_TIMEOUT_MS = Number(
    (env.STT_TIMEOUT_MS as string) ||
    process.env.STT_TIMEOUT_MS ||
    60_000
  );
  const CORS_ORIGIN =
    (env.CORS_ORIGIN as string) ||
    process.env.CORS_ORIGIN ||
    '*';

  const emitProxyEvent = (
    level: 'error' | 'warning',
    message: string,
    description?: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) => {
    const payload = {
      message,
      description,
      source: 'stt-proxy',
      scope: 'vite-dev-server',
      context,
      error,
    };
    try {
      (level === 'error' ? emitAgentError : emitAgentWarning)(payload);
    } catch (emitError) {
      const logger = level === 'error' ? console.error : console.warn;
      logger(`[STT proxy][${level.toUpperCase()}] ${message}`, {
        description,
        context,
        originalError: error,
        emitError,
      });
    }
  };

  return (req: IncomingMessage, res: ServerResponse) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      emitProxyEvent(
        'warning',
        'STT proxy rejected unsupported method',
        `Received ${req.method} request`,
        { method: req.method }
      );
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    if (!OPENAI_API_KEY) {
      emitProxyEvent('error', 'STT proxy misconfigured', 'OPENAI_API_KEY is missing');
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'STT server not configured: OPENAI_API_KEY is missing' }));
      return;
    }

    const rawContentType = (req.headers?.['content-type'] as string | undefined) || '';
    const normalizedContentType = rawContentType.toLowerCase();
    if (!normalizedContentType.startsWith('multipart/form-data')) {
      emitProxyEvent(
        'warning',
        'STT proxy invalid content type',
        `Expected multipart/form-data, received ${rawContentType || 'unknown'}`,
        { contentType: rawContentType }
      );
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid content type' }));
      return;
    }

    const requestId = randomUUID();
    const startedAt = Date.now();
    const controller = new AbortController();
    const limitedStream = new PassThrough({ highWaterMark: 64 * 1024 });

    let settled = false;
    let totalBytes = 0;
    let timeoutId: NodeJS.Timeout | undefined;

    const finalize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      settled = true;
    };

    const stopStreaming = () => {
      if (!req.complete && !req.destroyed) {
        req.destroy();
      }
      if (!limitedStream.destroyed) {
        limitedStream.destroy();
      }
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    const finishWithError = (
      statusCode: number,
      message: string,
      description?: string,
      context?: Record<string, unknown>,
      error?: unknown,
    ) => {
      if (settled) {
        return;
      }
      finalize();
      stopStreaming();

      const payloadContext = {
        requestId,
        durationMs: Date.now() - startedAt,
        totalBytes,
        limitBytes: STT_MAX_BYTES,
        ...context,
      };

      emitProxyEvent(statusCode >= 500 ? 'error' : 'warning', message, description, payloadContext, error);

      if (!res.headersSent && !res.writableEnded) {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const body: Record<string, unknown> = { error: message };
        if (description) {
          body.details = description;
        }
        res.end(JSON.stringify(body));
      }
    };

    const finishWithSuccess = (text: string) => {
      if (settled) {
        return;
      }
      finalize();

      if (!res.headersSent && !res.writableEnded) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ text }));
      }
    };

    timeoutId = setTimeout(() => {
      finishWithError(
        504,
        'STT request timeout',
        `Request exceeded ${STT_TIMEOUT_MS}ms timeout`,
        { timeoutMs: STT_TIMEOUT_MS }
      );
    }, STT_TIMEOUT_MS);

    limitedStream.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > STT_MAX_BYTES) {
        finishWithError(
          413,
          'Payload too large',
          `Audio payload exceeded ${STT_MAX_BYTES} bytes`,
          { receivedBytes: totalBytes }
        );
      }
    });

    limitedStream.on('error', (streamErr: Error) => {
      finishWithError(500, 'Stream processing error', streamErr.message, undefined, streamErr);
    });

    req.on('error', (reqErr: Error) => {
      finishWithError(400, 'Client stream error', reqErr.message, undefined, reqErr);
    });

    req.on('aborted', () => {
      if (settled) {
        return;
      }
      finalize();
      stopStreaming();
      emitProxyEvent(
        'warning',
        'Client aborted STT upload',
        'Client closed connection before upload completed',
        {
          requestId,
          durationMs: Date.now() - startedAt,
          totalBytes,
        }
      );
    });

    req.pipe(limitedStream);

    (async () => {
      try {
        const upstreamBody = Readable.toWeb(limitedStream) as unknown as FetchBody;
        const upstreamInit: NodeRequestInit = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            Accept: 'application/json',
            'Content-Type': rawContentType,
          },
          body: upstreamBody,
          signal: controller.signal,
          duplex: 'half',
        };
        const upstreamResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', upstreamInit);

        const raw = await upstreamResponse.text();
        if (settled) {
          return;
        }

        if (!upstreamResponse.ok) {
          const description = `OpenAI responded with ${upstreamResponse.status} ${upstreamResponse.statusText}`;
          const bodyPreview = raw.slice(0, 2000);
          finishWithError(
            upstreamResponse.status,
            'OpenAI STT error',
            bodyPreview ? `${description}. Body: ${bodyPreview}` : description,
            { upstreamStatus: upstreamResponse.status }
          );
          return;
        }

        let data: { text?: string; data?: { text?: string }; result?: string };
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (parseError) {
          finishWithError(
            502,
            'Invalid STT response format',
            'Failed to parse transcription response as JSON',
            { upstreamStatus: upstreamResponse.status },
            parseError
          );
          return;
        }

        const textCandidate =
          typeof data?.text === 'string'
            ? data.text
            : typeof data?.data?.text === 'string'
              ? data.data.text
              : typeof data?.result === 'string'
                ? data.result
                : '';

        if (!textCandidate || typeof textCandidate !== 'string') {
          finishWithError(
            502,
            'Invalid STT response format',
            'Transcription response does not contain text field',
            { upstreamStatus: upstreamResponse.status }
          );
          return;
        }

        finishWithSuccess(String(textCandidate).trim());
      } catch (error) {
        if (settled) {
          return;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          finishWithError(504, 'STT request timeout', 'STT proxy aborted the upstream request', undefined, error);
          return;
        }
        finishWithError(
          502,
          'Upstream STT fetch failed',
          (error as Error)?.message || 'Unknown upstream error',
          undefined,
          error
        );
      }
    })();
  };
}

interface ViteDevServer {
  middlewares: {
    use: (path: string, handler: NextHandleFunction) => void;
  };
}

const sttProxyPlugin = (env: Record<string, string | undefined>) => ({
  name: 'local-stt-proxy',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/api/stt/transcribe', createSttMiddleware(env));
  },
  configurePreviewServer(server: ViteDevServer) {
    server.middlewares.use('/api/stt/transcribe', createSttMiddleware(env));
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();

  return {
    plugins: [
      react(),
      tailwindcss(),
      sttProxyPlugin(env),
    ],
    resolve: {
      alias: {
        '@': resolve(projectRoot, 'src')
      }
    },
    server: {
      watch: {
        ignored: [
          '**/storage/**',
          '**/qdrant_data/**',
          '**/node_modules/**',
          '**/.git/**'
        ]
      },
      proxy: {
        '/qdrant': {
          target: process.env.VITE_QDRANT_URL || 'http://localhost:6333',
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/qdrant/, ''),
        },
      },
      // Добавляем настройки для HMR
      hmr: {
        overlay: false
      },
      // Явно указываем host для WebSocket
      host: 'localhost',
      port: 5173,
    },
    // Добавляем настройки для правильной обработки статических файлов
    publicDir: 'public',
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('@phosphor-icons') || id.includes('lucide-react')) return 'vendor-icons';
            if (
              id.includes('remark') ||
              id.includes('rehype') ||
              id.includes('react-markdown') ||
              id.includes('highlight.js')
            ) {
              return 'vendor-markdown';
            }
            if (id.includes('three')) return 'vendor-three';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 1024,
    },
  };
});

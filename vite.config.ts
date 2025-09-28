/// <reference types="node" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { resolve } from 'path'
import Busboy from 'busboy'
// Локальный тип middleware-обработчика (аналог connect)
type NextHandleFunction = (req: any, res: any, next: any) => void

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

  return (req: any, res: any, _next: any) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    if (!OPENAI_API_KEY) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'STT server not configured: OPENAI_API_KEY is missing' }));
      return;
    }

    try {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: STT_MAX_BYTES } });
      let model = 'whisper-1';
      let language = 'ru';
      let fileName = 'audio.webm';
      let fileMime = 'audio/webm';
      const fileChunks: Buffer[] = [];
      let total = 0;
      let fileReceived = false;
      let aborted = false;

      // Поля формы
      bb.on('field', (name: string, val: string) => {
        if (name === 'model' && typeof val === 'string' && val.trim()) model = val.trim();
        if (name === 'language' && typeof val === 'string' && val.trim()) language = val.trim();
      });

      // Файл
      bb.on('file', (_name: string, file: any, info: any) => {
        fileReceived = true;
        fileName = info?.filename || fileName;
        // busboy в новых версиях использует info.mimeType
        fileMime = (info as any)?.mimeType || (info as any)?.mime || fileMime;

        file.on('data', (data: Buffer) => {
          if (aborted) return;
          total += data.length;
          if (total > STT_MAX_BYTES) {
            aborted = true;
            try { file.resume(); } catch {}
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Payload too large' }));
            return;
          }
          fileChunks.push(data);
        });

        file.on('limit', () => {
          aborted = true;
          try { file.resume(); } catch {}
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'File too large' }));
        });
      });

      bb.on('error', (err: any) => {
        if (aborted) return;
        res.statusCode = 400;
        res.end(JSON.stringify({ error: `Multipart parse error: ${err?.message || 'unknown'}` }));
      });

      bb.on('finish', async () => {
        if (aborted) return;
        if (!fileReceived || fileChunks.length === 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'No audio file provided' }));
          return;
        }
        try {
          const buffer = Buffer.concat(fileChunks);
          // Используем Web API FormData/Blob из Node (undici)
          const form = new FormData();
          const blob = new Blob([buffer], { type: fileMime || 'audio/webm' });
          // filename вторым аргументом, чтобы OpenAI правильно принял файл
          form.append('file', blob, fileName || 'audio.webm');
          form.append('model', model || 'whisper-1');
          form.append('language', language || 'ru');
          form.append('response_format', 'json');

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
          const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: form,
            signal: controller.signal,
          }).catch((e: any) => {
            throw new Error(`Upstream STT fetch failed: ${e?.message || e}`);
          });
          clearTimeout(timer);

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: `OpenAI STT error: ${response.status} ${response.statusText}`, details: errText.slice(0, 2000) }));
            return;
          }

          const data = await response.json().catch(() => ({} as any));
          const text = data?.text ?? data?.data?.text ?? data?.result ?? '';
          if (typeof text !== 'string') {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: 'Invalid STT response format' }));
            return;
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.statusCode = 200;
          res.end(JSON.stringify({ text: String(text).trim() }));
        } catch (err: any) {
          const msg = err?.name === 'AbortError' ? 'STT request timeout' : (err?.message || 'Unknown STT error');
          res.statusCode = err?.name === 'AbortError' ? 504 : 500;
          res.end(JSON.stringify({ error: msg }));
        }
      });

      req.pipe(bb);
    } catch (e: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e?.message || 'Internal STT error' }));
    }
  };
}

const sttProxyPlugin = (env: Record<string, string | undefined>) => ({
  name: 'local-stt-proxy',
  configureServer(server: any) {
    server.middlewares.use('/api/stt/transcribe', createSttMiddleware(env));
  },
  configurePreviewServer(server: any) {
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
    },
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

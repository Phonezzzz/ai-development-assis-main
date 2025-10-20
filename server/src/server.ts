import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";

import { config } from "./config";
import { fileRouter } from "./modules/files/file.router";
import { workspaceRouter } from "./modules/workspace/workspace.router";
import { FileWatcher } from "./modules/files/file.watcher";

const server = Fastify({
  logger: true
});

let fileWatcher: FileWatcher | undefined;

// Хранилище WebSocket соединений
interface ConnectionInfo {
  socket: FastifyWebSocket;
  type: 'workspace-chat' | 'files' | 'terminal';
  sessionId?: string;
  connectedAt: string;
}

const connections = new Map<string, ConnectionInfo>();

// Локальный тип WebSocket для Fastify
interface FastifyWebSocket {
  send(data: any, cb?: (err?: Error) => void): void;
  close(code?: number, data?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  readyState: number;
  OPEN: number;
}

async function registerPlugins() {
  await server.register(cors, {
    origin: true,
    credentials: true
  });

  await server.register(multipart, {
    limits: {
      fileSize: 5000 * 1024 * 1024 // 5000MB
    }
  });

  await server.register(websocket);
  await server.register(fileRouter, {
    workspacePath: config.workspacePath
  });
  await server.register(workspaceRouter, {
    workspacePath: config.workspacePath
  });
}

// Безопасная функция для отправки сообщений через WebSocket
function safeSend(ws: FastifyWebSocket, data: unknown): void {
  if (typeof ws.send !== 'function') {
    console.error('WebSocket send method is not a function:', typeof ws.send);
    return;
  }
  
  if (ws.readyState !== ws.OPEN) {
    console.warn('WebSocket is not open, readyState:', ws.readyState);
    return;
  }
  
  try {
    const message = JSON.stringify(data);
    ws.send(message, (err) => {
      if (err) {
        console.error('Error sending WebSocket message:', err);
      }
    });
  } catch (error) {
    console.error('Error stringifying WebSocket message:', error);
  }
}

// Basic healthcheck endpoint.
server.get("/health", async () => ({
  status: "ok"
}));

interface WebSocketConnection {
  socket: FastifyWebSocket;
}

// WebSocket endpoint для workspace чата
server.register(async function (fastify) {
  fastify.get("/ws/workspace/chat/:sessionId", { websocket: true }, (connection: WebSocketConnection, request) => {
    const ws = connection.socket;
    const sessionId = (request.params as { sessionId?: string })?.sessionId;
    if (!sessionId) {
      ws.close();
      return;
    }
    
    const connectionId = `${sessionId}_${Date.now()}`;
    
    connections.set(connectionId, {
      socket: ws,
      type: 'workspace-chat',
      sessionId,
      connectedAt: new Date().toISOString()
    });

    safeSend(ws, {
      type: 'connected',
      sessionId,
      timestamp: new Date().toISOString()
    });

    ws.on('message', (message: unknown) => {
      try {
        if (!Buffer.isBuffer(message)) {
          throw new Error(`Expected Buffer, got ${typeof message}`);
        }
        const data = JSON.parse(message.toString()) as { type?: string; [key: string]: unknown };
        // Эхо для тестирования
        safeSend(ws, {
          type: 'echo',
          data,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        safeSend(ws, {
          type: 'error',
          message: 'Invalid JSON',
          timestamp: new Date().toISOString()
        });
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });

    ws.on('error', (error: unknown) => {
      fastify.log.error(
        { module: "ws-workspace-chat", sessionId, error },
        "WS workspace chat socket error"
      );
      connections.delete(connectionId);
    });
  });
});

// WebSocket endpoint для файловых обновлений
server.register(async function (fastify) {
  fastify.get("/ws/files", { websocket: true }, (connection: WebSocketConnection, request) => {
    const ws = connection.socket;
    const remoteAddress =
      (request.raw as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress ??
      request.ip ??
      "unknown";
    const connectionId = `files_${Date.now()}`;
    
    connections.set(connectionId, {
      socket: ws,
      type: 'files',
      connectedAt: new Date().toISOString()
    });

    safeSend(ws, {
      type: 'connected',
      service: 'files',
      timestamp: new Date().toISOString()
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });

    ws.on('error', (error: unknown) => {
      fastify.log.error(
        { module: "ws-files", connectionId, remoteAddress, error },
        "WS files socket error"
      );
      connections.delete(connectionId);
    });
  });
});

// WebSocket endpoint для терминальных событий
server.register(async function (fastify) {
  fastify.get("/ws/terminal/:sessionId", { websocket: true }, (connection: WebSocketConnection, request) => {
    const ws = connection.socket;
    const sessionId = (request.params as { sessionId?: string })?.sessionId;
    const remoteAddress =
      (request.raw as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress ??
      request.ip ??
      "unknown";
    if (!sessionId) {
      ws.close();
      return;
    }
    
    const connectionId = `terminal_${sessionId}_${Date.now()}`;
    
    connections.set(connectionId, {
      socket: ws,
      type: 'terminal',
      sessionId,
      connectedAt: new Date().toISOString()
    });

    safeSend(ws, {
      type: 'connected',
      service: 'terminal',
      sessionId,
      timestamp: new Date().toISOString()
    });

    ws.on('message', (message: unknown) => {
      try {
        if (!Buffer.isBuffer(message)) {
          throw new Error(`Expected Buffer, got ${typeof message}`);
        }
        const data = JSON.parse(message.toString()) as { type?: string; command?: string; commandId?: string };

        // Эмулируем вывод команды для демонстрации
        if (data.type === 'command' && data.command) {
          setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
              safeSend(ws, {
                type: 'output',
                commandId: data.commandId,
                content: `Executed: ${data.command}\nCommand completed successfully.`,
                timestamp: new Date().toISOString()
              });
            }
          }, 1000);
        }
      } catch (error) {
        safeSend(ws, {
          type: 'error',
          message: 'Invalid JSON',
          timestamp: new Date().toISOString()
        });
      }
    });

    ws.on('close', () => {
      connections.delete(connectionId);
    });

    ws.on('error', (error: unknown) => {
      fastify.log.error(
        { module: "ws-terminal", sessionId, remoteAddress, error },
        "WS terminal socket error"
      );
      connections.delete(connectionId);
    });
  });
});

// Прокси-роут для ElevenLabs STT
server.post("/api/stt/transcribe", async (request, reply) => {
  if (!config.elevenlabs.apiKey?.trim()) {
    return reply.status(500).send({
      error: {
        code: "E_ELEVENLABS_CONFIG",
        message: "ElevenLabs API key is not configured on the server"
      }
    });
  }

  if (!request.isMultipart?.() || !request.isMultipart()) {
    return reply.status(400).send({
      error: {
        code: "E_INVALID_CONTENT_TYPE",
        message: "Expected multipart/form-data request"
      }
    });
  }

  const fields: Record<string, string> = {};
  let filePart: Awaited<ReturnType<typeof request.file>> | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file" && !filePart) {
      filePart = part;
    } else if (part.type !== "file" && typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }

  if (!filePart) {
    return reply.status(400).send({
      error: {
        code: "E_FILE_REQUIRED",
        message: "Field \"file\" is required"
      }
    });
  }

  const fileBuffer = await filePart.toBuffer();
  const filename = filePart.filename || "audio.webm";
  const mimetype = filePart.mimetype || "audio/webm";

  const formData = new FormData();
  const uint8Array = Uint8Array.from(fileBuffer);
  const blob = new Blob([uint8Array.buffer], { type: mimetype });
  formData.append("file", blob, filename);
  formData.append("model_id", fields["model_id"] || "scribe-v1");

  const language = fields["language"] || fields["language_code"];
  if (language) {
    formData.append("language", language);
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text/convert", {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenlabs.apiKey,
        "Accept": "application/json"
      },
      body: formData
    });

    const bodyText = await response.text();

    if (!response.ok) {
      server.log.error(
        { status: response.status, body: bodyText },
        "ElevenLabs STT request failed"
      );

      return reply.status(response.status).send({
        error: {
          code: "E_ELEVENLABS_STT",
          message: "Failed to transcribe audio",
          detail: bodyText
        }
      });
    }

    let data: { text?: string; [key: string]: unknown } = {};
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch (error) {
      server.log.error({ err: error, body: bodyText }, "Invalid JSON from ElevenLabs STT");
      return reply.status(502).send({
        error: {
          code: "E_INVALID_RESPONSE",
          message: "ElevenLabs returned invalid JSON",
          detail: bodyText
        }
      });
    }

    if (typeof data?.text !== "string") {
      server.log.error({ data }, "ElevenLabs STT response missing text field");
      return reply.status(502).send({
        error: {
          code: "E_MISSING_TEXT",
          message: "ElevenLabs response does not contain a text field",
          detail: data
        }
      });
    }

    return reply.send({
      text: data.text,
      raw: data
    });
  } catch (error) {
    server.log.error({ err: error }, "ElevenLabs STT request failed");
    return reply.status(502).send({
      error: {
        code: "E_ELEVENLABS_STT",
        message: (error as Error).message
      }
    });
  }
});

// Функция для рассылки сообщений всем подключенными клиентам
function broadcast(type: string, data: unknown, filter?: (conn: ConnectionInfo) => boolean) {
  connections.forEach((conn, id) => {
    if (conn.socket.readyState === conn.socket.OPEN) {
      if (!filter || filter(conn)) {
        safeSend(conn.socket, {
          type,
          data,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      connections.delete(id);
    }
  });
}

async function start() {
  try {
    await registerPlugins();

    fileWatcher = new FileWatcher(server, server.fileService);
    await fileWatcher.start();

    server.addHook("onClose", async () => {
      await fileWatcher?.stop();
    });

    await server.listen({
      port: config.port,
      host: "0.0.0.0"
    });

    server.log.info(
      `Server started on port ${config.port} with workspace at ${config.workspacePath}`
    );
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

void start();
import type { FastifyPluginAsync, FastifyPluginCallback, FastifyInstance } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import type { Server as WebSocketServer, WebSocket } from "ws";

declare module "@fastify/cors" {
  export interface FastifyCorsOptions {
    origin?: boolean | string | RegExp | Array<string | RegExp>;
    credentials?: boolean;
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    maxAge?: number;
  }

  const plugin: FastifyPluginAsync<FastifyCorsOptions>;
  export default plugin;
}

export interface FastifyWebsocketPluginOptions {
  options?: ConstructorParameters<typeof WebSocketServer>[0];
}

export interface FastifyWebsocketStream {
  socket: WebSocket;
}

declare module "@fastify/websocket" {
  const plugin: FastifyPluginCallback<FastifyWebsocketPluginOptions>;
  export default plugin;
  export type { FastifyWebsocketPluginOptions, FastifyWebsocketStream };
}

declare module "@fastify/multipart" {
  interface FastifyMultipartOptions {
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    websocketServer: WebSocketServer;
  }

  interface FastifyRequest {
    isMultipart(): boolean;
    file(): Promise<MultipartFile>;
    file(opts: unknown): Promise<MultipartFile>;
    files(): AsyncIterableIterator<MultipartFile>;
    parts(): AsyncIterableIterator<Multipart | MultipartFile>;
  }
}
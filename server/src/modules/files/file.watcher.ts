import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import type { FileService } from "./file.service";
import type { FileChangeEvent, FileMetadata } from "../../types/file";
import { isWorkspaceError } from "./file.errors";

type WatcherEvent = "add" | "addDir" | "change" | "unlink" | "unlinkDir";

interface WebSocketClientLike {
  readyState: number;
  send(data: string): void;
}

interface WebSocketServerLike {
  clients: Set<WebSocketClientLike>;
}

function getWebSocketServer(instance: FastifyInstance): WebSocketServerLike | undefined {
  const fastifyWithWs = instance as FastifyInstance & {
    websocketServer?: WebSocketServerLike;
  };

  return fastifyWithWs.websocketServer;
}

export class FileWatcher {
  private watcher?: FSWatcher;
  private readonly workspacePath: string;
  private readonly log: FastifyBaseLogger;

  constructor(
    private readonly fastify: FastifyInstance,
    private readonly service: FileService
  ) {
    this.workspacePath = service.getWorkspacePath();
    this.log = fastify.log.child({ module: "file-watcher" });
  }

  public async start(): Promise<void> {
    if (this.watcher !== undefined) {
      this.log.warn("File watcher already started, skipping reinitialization.");
      return;
    }

    this.log.info({ workspace: this.workspacePath }, "Starting file watcher.");

    this.watcher = chokidar.watch(this.workspacePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    const events: WatcherEvent[] = ["add", "addDir", "change", "unlink", "unlinkDir"];

    for (const event of events) {
      this.watcher.on(event, (filePath: string) => {
        void this.handleEvent(event, filePath);
      });
    }

    this.watcher.on("error", (error: unknown) => {
      this.log.error({ err: error }, "File watcher error.");
    });
  }

  public async stop(): Promise<void> {
    if (this.watcher === undefined) {
      return;
    }

    this.log.info("Stopping file watcher.");

    await this.watcher.close();
    this.watcher = undefined;
  }

  private async handleEvent(event: WatcherEvent, rawPath: string): Promise<void> {
    const absolutePath = path.resolve(rawPath);
    let relativePath: string;

    try {
      relativePath = this.service.toRelativePath(absolutePath);
    } catch (error) {
      if (isWorkspaceError(error)) {
        this.log.warn(
          { err: error, path: rawPath },
          "Received filesystem event outside of workspace."
        );
        return;
      }

      this.log.error({ err: error, path: rawPath }, "Failed to resolve relative path.");
      return;
    }

    let metadata: FileMetadata | undefined;
    let entryType: FileChangeEvent["type"] = "unknown";

    if (event !== "unlink" && event !== "unlinkDir") {
      try {
        metadata = await this.service.getMetadata(relativePath);
        entryType = metadata.type;
      } catch (error) {
        if (isWorkspaceError(error) && error.statusCode === 404) {
          entryType = "unknown";
        } else {
          this.log.error(
            { err: error, event, path: relativePath },
            "Failed to obtain metadata during watcher event."
          );
          return;
        }
      }
    } else {
      entryType = event === "unlink" ? "file" : "directory";
    }

    const payload: FileChangeEvent = {
      event,
      path: metadata?.path ?? relativePath,
      absolutePath,
      type: entryType,
      timestamp: Date.now()
    };

    this.broadcast(payload);
  }

  private broadcast(payload: FileChangeEvent): void {
    const wsServer = getWebSocketServer(this.fastify);

    if (!wsServer) {
      this.log.warn("WebSocket server is not available; skipping broadcast.");
      return;
    }

    const serialized = JSON.stringify({
      channel: "files:update",
      payload
    });

    for (const client of wsServer.clients) {
      if (client.readyState === 1) {
        try {
          // Добавляем проверку типа перед вызовом send
          if (typeof client.send === 'function') {
            client.send(serialized);
          } else {
            this.log.warn('WebSocket client does not have send method');
          }
        } catch (error) {
          this.log.error({ err: error }, "Failed to send watcher event to WebSocket client.");
        }
      }
    }
  }
}
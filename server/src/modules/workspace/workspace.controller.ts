import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyBaseLogger
} from "fastify";
import type { WorkspaceService } from "./workspace.service";
import type { TerminalService } from "./terminal.service";
import type { 
  WorkspaceSession, 
  WorkspaceChatMessage, 
  WorkspaceChatMessagePayload,
  WorkspaceSessionId,
  WorkspaceTerminalCommandPayload,
  WorkspaceTerminalCommandResponse,
  WorkspaceTerminalSession
} from "../../types/workspace";

interface RegisterWorkspaceControllerOptions {
  fastify: FastifyInstance;
  service: WorkspaceService;
  terminalService?: TerminalService;
}

interface CreateSessionBody {
  name: string;
  description?: string;
}

interface UpdateSessionBody {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface CreateMessageBody {
  role: 'user' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

interface TerminalCommandBody {
  command: string;
  workingDirectory?: string;
  metadata?: Record<string, unknown>;
}

export function registerWorkspaceController(options: RegisterWorkspaceControllerOptions): void {
  const { fastify, service, terminalService } = options;
  const log = fastify.log.child({ module: "workspace-controller" });

  // Получить все сессии
  fastify.get("/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await service.getSessions();
      return reply.send({ sessions });
    } catch (error) {
      log.error(error, "Failed to fetch workspace sessions");
      return reply.status(500).send({
        error: {
          code: "E_SESSIONS_FETCH_FAILED",
          message: "Не удалось получить сессии рабочего пространства"
        }
      });
    }
  });

  // Создать новую сессию
  fastify.post(
    "/sessions",
    async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
      const body = request.body as CreateSessionBody;

      if (!body.name || body.name.trim() === '') {
        return reply.status(400).send({
          error: {
            code: "E_INVALID_INPUT",
            message: "Название сессии не может быть пустым"
          }
        });
      }

      try {
        const session = await service.createSession(body.name.trim(), body.description?.trim());
        return reply.status(201).send({ session });
      } catch (error) {
        log.error(error, "Failed to create workspace session");
        return reply.status(500).send({
          error: {
            code: "E_SESSION_CREATE_FAILED",
            message: "Не удалось создать сессию рабочего пространства"
          }
        });
      }
    }
  );

  // Получить конкретную сессию
  fastify.get(
    "/sessions/:sessionId",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      try {
        const session = await service.getSession(sessionId);
        if (!session) {
          return reply.status(404).send({
            error: {
              code: "E_SESSION_NOT_FOUND",
              message: `Сессия ${sessionId} не найдена`
            }
          });
        }
        return reply.send({ session });
      } catch (error) {
        log.error(error, `Failed to fetch workspace session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_SESSION_FETCH_FAILED",
            message: "Не удалось получить сессию рабочего пространства"
          }
        });
      }
    }
  );

  // Обновить сессию
  fastify.put(
    "/sessions/:sessionId",
    async (request: FastifyRequest<{ 
      Params: { sessionId: string };
      Body: UpdateSessionBody;
    }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const body = request.body as UpdateSessionBody;

      try {
        const session = await service.updateSession(sessionId, body);
        return reply.send({ session });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage === `Session ${sessionId} not found`) {
          return reply.status(404).send({
            error: {
              code: "E_SESSION_NOT_FOUND",
              message: `Сессия ${sessionId} не найдена`
            }
          });
        }

        log.error(error, `Failed to update workspace session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_SESSION_UPDATE_FAILED",
            message: "Не удалось обновить сессию рабочего пространства"
          }
        });
      }
    }
  );

  // Удалить сессию
  fastify.delete(
    "/sessions/:sessionId",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      try {
        await service.deleteSession(sessionId);
        return reply.status(204).send();
      } catch (error) {
        log.error(error, `Failed to delete workspace session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_SESSION_DELETE_FAILED",
            message: "Не удалось удалить сессию рабочего пространства"
          }
        });
      }
    }
  );

  // Получить сообщения чата для сессии
  fastify.get(
    "/sessions/:sessionId/chat",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      try {
        const messages = await service.getChatMessages(sessionId);
        return reply.send({ messages });
      } catch (error) {
        log.error(error, `Failed to fetch chat messages for session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_CHAT_FETCH_FAILED",
            message: "Не удалось получить сообщения чата"
          }
        });
      }
    }
  );

  // Добавить сообщение в чат сессии
  fastify.post(
    "/sessions/:sessionId/chat",
    async (request: FastifyRequest<{ 
      Params: { sessionId: string };
      Body: CreateMessageBody;
    }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const body = request.body as CreateMessageBody;

      if (!body.content || body.content.trim() === '') {
        return reply.status(400).send({
          error: {
            code: "E_INVALID_INPUT",
            message: "Содержимое сообщения не может быть пустым"
          }
        });
      }

      if (!['user', 'system'].includes(body.role)) {
        return reply.status(400).send({
          error: {
            code: "E_INVALID_INPUT",
            message: "Роль сообщения должна быть 'user' или 'system'"
          }
        });
      }

      try {
        const message = await service.addChatMessage(sessionId, {
          role: body.role,
          content: body.content.trim(),
          metadata: body.metadata
        });
        return reply.status(201).send({ message });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage === `Session ${sessionId} not found`) {
          return reply.status(404).send({
            error: {
              code: "E_SESSION_NOT_FOUND",
              message: `Сессия ${sessionId} не найдена`
            }
          });
        }

        log.error(error, `Failed to add chat message to session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_CHAT_MESSAGE_CREATE_FAILED",
            message: "Не удалось добавить сообщение в чат"
          }
        });
      }
    }
  );

  // Очистить сообщения чата сессии
  fastify.delete(
    "/sessions/:sessionId/chat",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      try {
        await service.clearChatMessages(sessionId);
        return reply.status(204).send();
      } catch (error) {
        log.error(error, `Failed to clear chat messages for session ${sessionId}`);
        return reply.status(500).send({
          error: {
            code: "E_CHAT_CLEAR_FAILED",
            message: "Не удалось очистить сообщения чата"
          }
        });
      }
    }
  );

  if (terminalService) {
    // Создать терминальную сессию
    fastify.post(
      "/sessions/:sessionId/terminal/session",
      async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
        const { sessionId } = request.params;

        try {
          const terminalSession = await terminalService.createSession(sessionId);
          return reply.status(201).send({ terminalSession });
        } catch (error) {
          log.error(error, `Failed to create terminal session for ${sessionId}`);
          return reply.status(500).send({
            error: {
              code: "E_TERMINAL_CREATE_FAILED",
              message: "Не удалось создать терминальную сессию"
            }
          });
        }
      }
    );

    // Выполнить команду в терминале
    fastify.post(
      "/sessions/:sessionId/terminal/command",
      async (request: FastifyRequest<{ 
        Params: { sessionId: string };
        Body: TerminalCommandBody;
      }>, reply: FastifyReply) => {
        const { sessionId } = request.params;
        const body = request.body as TerminalCommandBody;

        if (!body.command || body.command.trim() === '') {
          return reply.status(400).send({
            error: {
              code: "E_INVALID_INPUT",
              message: "Команда не может быть пустой"
            }
          });
        }

        try {
          // Для простоты используем первый активный терминал для сессии
          const activeTerminals = terminalService.getActiveTerminals();
          if (activeTerminals.length === 0) {
            // Создаем новую терминальную сессию
            const terminalSession = await terminalService.createSession(sessionId);
            const terminalId = terminalSession.id;
            
            const commandResponse = await terminalService.executeCommand(terminalId, {
              command: body.command.trim(),
              workingDirectory: body.workingDirectory,
              metadata: body.metadata
            });
            
            return reply.send({ commandResponse });
          } else {
            // Используем существующий терминал
            const terminalId = activeTerminals[0];
            const commandResponse = await terminalService.executeCommand(terminalId, {
              command: body.command.trim(),
              workingDirectory: body.workingDirectory,
              metadata: body.metadata
            });

            return reply.send({ commandResponse });
          }
        } catch (error: unknown) {
          log.error(error, `Failed to execute terminal command for session ${sessionId}`);
          return reply.status(500).send({
            error: {
              code: "E_TERMINAL_COMMAND_FAILED",
              message: "Не удалось выполнить терминальную команду"
            }
          });
        }
      }
    );

    // Закрыть терминальную сессию
    fastify.delete(
      "/sessions/:sessionId/terminal/session",
      async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
        const { sessionId } = request.params;

        try {
          const activeTerminals = terminalService.getActiveTerminals();
          for (const terminalId of activeTerminals) {
            await terminalService.closeSession(terminalId);
          }
          return reply.status(204).send();
        } catch (error) {
          log.error(error, `Failed to close terminal session for ${sessionId}`);
          return reply.status(500).send({
            error: {
              code: "E_TERMINAL_CLOSE_FAILED",
              message: "Не удалось закрыть терминальную сессию"
            }
          });
        }
      }
    );
  }
}
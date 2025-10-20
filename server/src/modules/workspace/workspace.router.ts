import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { registerWorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";
import { TerminalService } from "./terminal.service";
import { config } from "../../config";

declare module "fastify" {
  interface FastifyInstance {
    workspaceService: WorkspaceService;
    terminalService?: TerminalService;
  }
}

interface WorkspacePluginOptions {
  workspacePath?: string;
}

async function workspaceModule(
  fastify: FastifyInstance,
  options: WorkspacePluginOptions
): Promise<void> {
  const workspacePath = options.workspacePath ?? config.workspacePath;
  const service = new WorkspaceService(workspacePath);
  const terminalService = new TerminalService(workspacePath);

  if (fastify.hasDecorator("workspaceService")) {
    fastify.log.warn("workspaceService уже зарегистрирован, повторная инициализация пропущена.");
    return;
  }

  fastify.decorate("workspaceService", service);
  fastify.decorate("terminalService", terminalService);

  // Регистрируем контроллер с префиксом /api/workspace
  fastify.register(async function (fastify) {
    registerWorkspaceController({ fastify, service, terminalService });
  }, { prefix: '/api/workspace' });
}

export const workspaceRouter = fp(workspaceModule, {
  name: "workspace-router",
  fastify: "4.x"
});
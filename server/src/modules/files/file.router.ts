import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { registerFileController } from "./file.controller";
import { FileService } from "./file.service";
import { config } from "../../config";

declare module "fastify" {
  interface FastifyInstance {
    fileService: FileService;
  }
}

interface FilePluginOptions {
  workspacePath?: string;
}

async function fileModule(
  fastify: FastifyInstance,
  options: FilePluginOptions
): Promise<void> {
  const workspacePath = options.workspacePath ?? config.workspacePath;
  const service = new FileService(workspacePath);

  if (fastify.hasDecorator("fileService")) {
    fastify.log.warn("fileService уже зарегистрирован, повторная инициализация пропущена.");
    return;
  }

  fastify.decorate("fileService", service);

  fastify.register(
    async (scopedFastify) => {
      registerFileController({ fastify: scopedFastify, service });
    },
    { prefix: "/api" }
  );
}

export const fileRouter = fp(fileModule, {
  name: "file-router",
  fastify: "4.x"
});
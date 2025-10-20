import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyBaseLogger
} from "fastify";
import type { FileService } from "./file.service";
import { WorkspaceError, isWorkspaceError } from "./file.errors";

type EncodingInput = BufferEncoding | undefined;

interface RegisterFileControllerOptions {
  fastify: FastifyInstance;
  service: FileService;
}

interface TreeQuery {
  path?: string;
}

interface ContentQuery {
  path?: string;
  encoding?: string;
}

interface CreateBody {
  path?: string;
  type?: string;
  content?: string;
  encoding?: string;
}

interface UpdateBody {
  path?: string;
  content?: string;
  encoding?: string;
}

interface DeleteQuery {
  path?: string;
}

interface MoveBody {
  source?: string;
  target?: string;
}

interface IndexBody {
  path?: string;
}

export function registerFileController(options: RegisterFileControllerOptions): void {
  const { fastify, service } = options;
  const log = fastify.log.child({ module: "file-controller" });

  // Регистрируем хуки только один раз
  if (!fastify.hasDecorator("fileControllerHooksRegistered")) {
    fastify.decorate("fileControllerHooksRegistered", true);

    fastify.addHook("onRoute", (routeOptions) => {
      if (routeOptions.url.includes("/files")) {
        const methods = Array.isArray(routeOptions.method)
          ? routeOptions.method.join(",")
          : routeOptions.method;
        log.info(
          {
            event: "files-route-registered",
            url: routeOptions.url,
            methods
          },
          "Маршрут файлового модуля зарегистрирован"
        );
      }
    });

    fastify.addHook("onRequest", async (request) => {
      if (request.url.includes("/files")) {
        log.info(
          {
            event: "files-request-incoming",
            method: request.method,
            url: request.url,
            rawUrl: request.raw.url
          },
          "Входящий запрос к файловому модулю"
        );
      }
    });
  }

  fastify.get("/files/tree", async (request: FastifyRequest<{ Querystring: TreeQuery }>, reply: FastifyReply) => {
    const { path } = request.query as TreeQuery;

    try {
      const tree = await service.getTree(path);
      return reply.send({ tree });
    } catch (error) {
      return handleError(reply, error, "Не удалось получить дерево файлов.", log);
    }
  });

  fastify.get(
    "/files/content",
    async (request: FastifyRequest<{ Querystring: ContentQuery }>, reply: FastifyReply) => {
    const { path, encoding } = request.query as ContentQuery;

    if (!isPathProvided(path)) {
      return sendBadRequest(reply, "Необходимо указать параметр path.");
    }

    try {
      const parsedEncoding = normalizeEncoding(encoding);
      const result = await service.readFile(path, parsedEncoding ?? "utf8");
      return reply.send(result);
    } catch (error) {
      return handleError(reply, error, "Не удалось прочитать файл.", log);
    }
  });

  fastify.post(
    "/files",
    async (request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) => {
    const body = request.body as CreateBody;

    if (!isPathProvided(body.path)) {
      return sendBadRequest(reply, "Необходимо указать путь path для создания файла или каталога.");
    }

    if (!isValidType(body.type)) {
      return sendBadRequest(reply, 'Поле type должно быть "file" или "directory".');
    }

    try {
      const encoding = normalizeEncoding(body.encoding);
      const metadata = await service.create(body.path!, body.type! as "file" | "directory", {
        content: body.content,
        encoding
      });

      return reply.status(201).send({ metadata });
    } catch (error) {
      return handleError(reply, error, "Не удалось создать объект файловой системы.", log);
    }
  });

  fastify.put(
    "/files",
    async (request: FastifyRequest<{ Body: UpdateBody }>, reply: FastifyReply) => {
    const body = request.body as UpdateBody;

    if (!isPathProvided(body.path)) {
      return sendBadRequest(reply, "Необходимо указать путь path для записи файла.");
    }

    if (typeof body.content !== "string") {
      return sendBadRequest(reply, "Необходимо указать строковое содержимое content.");
    }

    try {
      const encoding = normalizeEncoding(body.encoding);
      const metadata = await service.writeFile(body.path!, body.content, encoding ?? "utf8");
      return reply.send({ metadata });
    } catch (error) {
      return handleError(reply, error, "Не удалось записать файл.", log);
    }
  });

  fastify.delete(
    "/files",
    async (request: FastifyRequest<{ Querystring: DeleteQuery }>, reply: FastifyReply) => {
    const { path } = request.query as DeleteQuery;

    if (!isPathProvided(path)) {
      return sendBadRequest(reply, "Необходимо указать параметр path для удаления.");
    }

    try {
      await service.delete(path!);
      return reply.status(204).send();
    } catch (error) {
      return handleError(reply, error, "Не удалось удалить объект файловой системы.", log);
    }
  });

  fastify.post(
    "/files/move",
    async (request: FastifyRequest<{ Body: MoveBody }>, reply: FastifyReply) => {
    const body = request.body as MoveBody;

    if (!isPathProvided(body.source) || !isPathProvided(body.target)) {
      return sendBadRequest(reply, "Необходимо указать source и target для перемещения.");
    }

    try {
      const metadata = await service.move(body.source!, body.target!);
      return reply.send({ metadata });
    } catch (error) {
      return handleError(reply, error, "Не удалось переместить объект файловой системы.", log);
    }
  });

  fastify.post(
    "/files/index",
    async (request: FastifyRequest<{ Body: IndexBody }>, reply: FastifyReply) => {
    const body = (request.body as IndexBody | undefined) ?? {};
    const targetPath = body.path ?? ".";

    try {
      const files = await service.index(targetPath);
      return reply.send({ files });
    } catch (error) {
      return handleError(reply, error, "Не удалось выполнить индексацию файлов.", log);
    }
  });
}

function isPathProvided(path: string | undefined | null): path is string {
  return typeof path === "string" && path.trim().length > 0;
}

function isValidType(type: string | undefined | null): type is "file" | "directory" {
  return type === "file" || type === "directory";
}

function normalizeEncoding(encoding?: string): EncodingInput {
  if (encoding === undefined) {
    return undefined;
  }

  const trimmed = encoding.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (!Buffer.isEncoding(trimmed)) {
    throw new WorkspaceError(
      400,
      "E_INVALID_ENCODING",
      `Кодировка "${trimmed}" не поддерживается.`
    );
  }

  return trimmed as BufferEncoding;
}

function sendBadRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({
    error: {
      code: "E_INVALID_INPUT",
      message
    }
  });
}

function handleError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
  log: FastifyBaseLogger
) {
  if (isWorkspaceError(error)) {
    const level = error.statusCode >= 500 ? "error" : "warn";
    log[level]({ err: error }, error.message);

    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  log.error({ err: error }, fallbackMessage);

  return reply.status(500).send({
    error: {
      code: "E_INTERNAL",
      message: fallbackMessage
    }
  });
}
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type { Stats } from "node:fs";
import type { FileMetadata, FileSystemEntryType, FileTreeNode } from "../../types/file";
import { WorkspaceError, isWorkspaceError } from "./file.errors";

type BufferEncodingExt = BufferEncoding | "utf8";

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function sortTreeNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type === b.type) {
    return a.name.localeCompare(b.name, "en");
  }

  if (a.type === "directory") {
    return -1;
  }

  return 1;
}

export class FileService {
  private readonly workspacePath: string;
  private readonly workspacePrefix: string;

  constructor(workspacePath: string) {
    const resolvedWorkspace = path.resolve(workspacePath);
    this.workspacePath = resolvedWorkspace;
    this.workspacePrefix = resolvedWorkspace.endsWith(path.sep)
      ? resolvedWorkspace
      : `${resolvedWorkspace}${path.sep}`;
  }

  public getWorkspacePath(): string {
    return this.workspacePath;
  }

  public toRelativePath(absolutePath: string): string {
    const relative = path.relative(this.workspacePath, absolutePath);
    const normalized = relative === "" ? "." : relative.split(path.sep).join(path.posix.sep);
    return normalized;
  }

  public async getMetadata(relativePath: string): Promise<FileMetadata> {
    const absolutePath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(absolutePath);
      return this.createMetadata(absolutePath, stats);
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error) && error.code === "ENOENT") {
        throw new WorkspaceError(
          404,
          "E_NOT_FOUND",
          `Путь "${relativePath}" не найден.`,
          error
        );
      }

      throw new WorkspaceError(
        500,
        "E_METADATA_FAILED",
        `Не удалось получить метаданные для "${relativePath}".`,
        error
      );
    }
  }

  public async readFile(relativePath: string, encoding: BufferEncodingExt = "utf8") {
    const absolutePath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(absolutePath);

      if (!stats.isFile()) {
        throw new WorkspaceError(
          400,
          "E_NOT_A_FILE",
          `Путь "${relativePath}" не является файлом.`
        );
      }

      const content = await fs.readFile(absolutePath, { encoding });

      return {
        content,
        encoding,
        metadata: this.createMetadata(absolutePath, stats)
      };
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error) && error.code === "ENOENT") {
        throw new WorkspaceError(
          404,
          "E_NOT_FOUND",
          `Файл "${relativePath}" не найден.`,
          error
        );
      }

      throw new WorkspaceError(
        500,
        "E_READ_FAILED",
        `Не удалось прочитать файл "${relativePath}".`,
        error
      );
    }
  }

  public async writeFile(
    relativePath: string,
    content: string,
    encoding: BufferEncodingExt = "utf8"
  ): Promise<FileMetadata> {
    const absolutePath = this.resolvePath(relativePath);
    const directory = path.dirname(absolutePath);

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(absolutePath, content, { encoding });
      const stats = await fs.stat(absolutePath);

      if (!stats.isFile()) {
        throw new WorkspaceError(
          400,
          "E_NOT_A_FILE",
          `Путь "${relativePath}" не является файлом.`
        );
      }

      return this.createMetadata(absolutePath, stats);
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      throw new WorkspaceError(
        500,
        "E_WRITE_FAILED",
        `Не удалось записать файл "${relativePath}".`,
        error
      );
    }
  }

  public async create(
    relativePath: string,
    type: FileSystemEntryType,
    options?: { content?: string; encoding?: BufferEncodingExt }
  ): Promise<FileMetadata> {
    const absolutePath = this.resolvePath(relativePath);
    const directory = path.dirname(absolutePath);

    try {
      await fs.mkdir(directory, { recursive: true });

      if (type === "directory") {
        await fs.mkdir(absolutePath);
      } else {
        const handle = await fs.open(
          absolutePath,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY
        );

        try {
          if (options?.content !== undefined) {
            await handle.writeFile(options.content, {
              encoding: options.encoding ?? "utf8"
            });
          }
        } finally {
          await handle.close();
        }
      }

      const stats = await fs.stat(absolutePath);
      return this.createMetadata(absolutePath, stats);
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error)) {
        if (error.code === "EEXIST") {
          throw new WorkspaceError(
            409,
            "E_ALREADY_EXISTS",
            `Объект "${relativePath}" уже существует.`,
            error
          );
        }

        if (error.code === "ENOENT") {
          throw new WorkspaceError(
            404,
            "E_PARENT_NOT_FOUND",
            `Родительский каталог для "${relativePath}" не найден.`,
            error
          );
        }
      }

      throw new WorkspaceError(
        500,
        "E_CREATE_FAILED",
        `Не удалось создать объект "${relativePath}".`,
        error
      );
    }
  }

  public async delete(relativePath: string): Promise<void> {
    const absolutePath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(absolutePath);
      await fs.rm(absolutePath, {
        recursive: stats.isDirectory(),
        force: false
      });
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error) && error.code === "ENOENT") {
        throw new WorkspaceError(
          404,
          "E_NOT_FOUND",
          `Объект "${relativePath}" не найден.`,
          error
        );
      }

      throw new WorkspaceError(
        500,
        "E_DELETE_FAILED",
        `Не удалось удалить "${relativePath}".`,
        error
      );
    }
  }

  public async move(sourcePath: string, targetPath: string): Promise<FileMetadata> {
    const sourceAbsolute = this.resolvePath(sourcePath);
    const targetAbsolute = this.resolvePath(targetPath);
    const targetDirectory = path.dirname(targetAbsolute);

    if (sourceAbsolute === targetAbsolute) {
      throw new WorkspaceError(
        400,
        "E_SAME_PATH",
        "Исходный и целевой пути совпадают."
      );
    }

    try {
      await fs.mkdir(targetDirectory, { recursive: true });
      await fs.rename(sourceAbsolute, targetAbsolute);

      const stats = await fs.stat(targetAbsolute);
      return this.createMetadata(targetAbsolute, stats);
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error)) {
        if (error.code === "ENOENT") {
          throw new WorkspaceError(
            404,
            "E_NOT_FOUND",
            `Объект "${sourcePath}" не найден.`,
            error
          );
        }

        if (error.code === "EEXIST") {
          throw new WorkspaceError(
            409,
            "E_TARGET_EXISTS",
            `Целевой путь "${targetPath}" уже существует.`,
            error
          );
        }
      }

      throw new WorkspaceError(
        500,
        "E_MOVE_FAILED",
        `Не удалось переместить "${sourcePath}" в "${targetPath}".`,
        error
      );
    }
  }

  public async getTree(relativePath = "."): Promise<FileTreeNode> {
    const absolutePath = this.resolvePath(relativePath);

    try {
      const stats = await fs.stat(absolutePath);
      return await this.buildTree(absolutePath, stats);
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      if (isNodeError(error) && error.code === "ENOENT") {
        throw new WorkspaceError(
          404,
          "E_NOT_FOUND",
          `Путь "${relativePath}" не найден.`,
          error
        );
      }

      throw new WorkspaceError(
        500,
        "E_TREE_FAILED",
        `Не удалось построить дерево для "${relativePath}".`,
        error
      );
    }
  }

  public async index(relativePath = "."): Promise<FileMetadata[]> {
    const absolutePath = this.resolvePath(relativePath);
    const result: FileMetadata[] = [];

    try {
      await this.walkRecursive(absolutePath, async (currentPath, stats) => {
        result.push(this.createMetadata(currentPath, stats));
      });

      return result;
    } catch (error) {
      if (isWorkspaceError(error)) {
        throw error;
      }

      throw new WorkspaceError(
        500,
        "E_INDEX_FAILED",
        `Не удалось проиндексировать "${relativePath}".`,
        error
      );
    }
  }

  private async buildTree(absolutePath: string, stats: Stats): Promise<FileTreeNode> {
    const node: FileMetadata = this.createMetadata(absolutePath, stats);

    if (!stats.isDirectory()) {
      return node;
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const children: FileTreeNode[] = [];

    for (const entry of entries) {
      const childAbsolute = path.join(absolutePath, entry.name);
      const childStats = await fs.stat(childAbsolute);
      children.push(await this.buildTree(childAbsolute, childStats));
    }

    children.sort(sortTreeNodes);

    return {
      ...node,
      children
    };
  }

  private async walkRecursive(
    absolutePath: string,
    visitor: (absolutePath: string, stats: Stats) => Promise<void> | void
  ) {
    const stats = await fs.stat(absolutePath);
    await visitor(absolutePath, stats);

    if (!stats.isDirectory()) {
      return;
    }

    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      const childAbsolute = path.join(absolutePath, entry.name);
      await this.walkRecursive(childAbsolute, visitor);
    }
  }

  private createMetadata(absolutePath: string, stats: Stats): FileMetadata {
    const type: FileSystemEntryType = stats.isDirectory() ? "directory" : "file";
    const relative = this.toRelativePath(absolutePath);
    const extension = type === "file" ? path.extname(absolutePath) : undefined;

    return {
      name: path.basename(absolutePath),
      path: relative,
      type,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      extension: extension && extension.length > 0 ? extension : undefined
    };
  }

  private resolvePath(target?: string): string {
    const normalizedTarget = this.normalizeTarget(target);
    const absolutePath = path.resolve(this.workspacePath, normalizedTarget);

    if (!this.isInsideWorkspace(absolutePath)) {
      throw new WorkspaceError(
        400,
        "E_OUT_OF_WORKSPACE",
        `Путь "${target ?? "."}" выходит за пределы рабочей области.`
      );
    }

    return absolutePath;
  }

  private normalizeTarget(target?: string): string {
    if (target === undefined || target === "" || target === "." || target === "./") {
      return ".";
    }

    const trimmed = target.replace(/^\/+/, "");
    return trimmed === "" ? "." : trimmed;
  }

  private isInsideWorkspace(absolutePath: string): boolean {
    return (
      absolutePath === this.workspacePath ||
      absolutePath.startsWith(this.workspacePrefix)
    );
  }
}
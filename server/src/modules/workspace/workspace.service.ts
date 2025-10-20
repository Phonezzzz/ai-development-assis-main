import DatabaseConstructor from "better-sqlite3";
import type { Database as BetterSqliteDatabase, Statement } from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  WorkspaceSession,
  WorkspaceChatMessage,
  WorkspaceChatMessagePayload,
  WorkspaceSessionId
} from "../../types/workspace";

interface SessionRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  last_message_at: string | null;
  metadata: string | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  metadata: string | null;
}

interface LegacyWorkspaceData {
  sessions: WorkspaceSession[];
  messages: Record<string, WorkspaceChatMessage[]>;
}

type PreparedStatements = {
  selectSessions: Statement<[], SessionRow>;
  selectSessionById: Statement<[WorkspaceSessionId], SessionRow>;
  insertSession: Statement<
    [
      string,
      string,
      string | null,
      string,
      string | null,
      string | null,
      string | null
    ]
  >;
  updateSessionData: Statement<
    [string, string | null, string | null, string | null, string | null, string]
  >;
  updateSessionTimestamps: Statement<[string, string | null, string], unknown>;
  deleteSession: Statement<[WorkspaceSessionId], unknown>;
  insertMessage: Statement<
    [string, WorkspaceSessionId, string, string, string, string | null]
  >;
  selectMessagesBySession: Statement<[WorkspaceSessionId], MessageRow>;
  deleteMessage: Statement<[string, WorkspaceSessionId], unknown>;
  deleteMessagesBySession: Statement<[WorkspaceSessionId], unknown>;
  selectLatestMessageTimestamp: Statement<[WorkspaceSessionId], { created_at: string }>;
};

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (value === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function serializeMetadata(metadata?: Record<string, unknown>): string | null {
  if (metadata === undefined) {
    return null;
  }

  if (Object.keys(metadata).length === 0) {
    return "{}";
  }

  return JSON.stringify(metadata);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export class WorkspaceService {
  private readonly dbPath: string;
  private db: BetterSqliteDatabase | null = null;
  private statements: PreparedStatements | null = null;
  private readonly initPromise: Promise<void>;

  constructor(private readonly workspacePath: string) {
    this.dbPath = path.join(workspacePath, ".workspace", "workspace.sqlite");
    this.initPromise = this.initialize();
  }

  async getSessions(): Promise<WorkspaceSession[]> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const rows: SessionRow[] = statements.selectSessions.all();
    return rows.map((row) => this.mapSessionRow(row));
  }

  async getSession(sessionId: WorkspaceSessionId): Promise<WorkspaceSession | null> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const row = statements.selectSessionById.get(sessionId) as SessionRow | undefined;
    return row ? this.mapSessionRow(row) : null;
  }

  async createSession(name: string, description?: string): Promise<WorkspaceSession> {
    await this.ensureInitialized();
    const statements = this.getStatements();

    const now = new Date().toISOString();
    const session: WorkspaceSession = {
      id: uuidv4(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      metadata: {
        type: "user-created",
        status: "active"
      }
    };

    statements.insertSession.run(
      session.id,
      session.name,
      session.description ?? null,
      session.createdAt,
      session.updatedAt ?? null,
      session.lastMessageAt ?? null,
      serializeMetadata(session.metadata)
    );

    return session;
  }

  async updateSession(
    sessionId: WorkspaceSessionId,
    updates: Partial<Pick<WorkspaceSession, "name" | "description" | "metadata">>
  ): Promise<WorkspaceSession> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const existingRow = statements.selectSessionById.get(sessionId) as SessionRow | undefined;

    if (!existingRow) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const existing = this.mapSessionRow(existingRow);
    const updated: WorkspaceSession = {
      ...existing,
      ...updates,
      metadata: updates.metadata !== undefined ? updates.metadata : existing.metadata,
      updatedAt: new Date().toISOString()
    };

    statements.updateSessionData.run(
      updated.name,
      updated.description ?? null,
      serializeMetadata(updated.metadata),
      updated.updatedAt ?? null,
      updated.lastMessageAt ?? null,
      sessionId
    );

    return updated;
  }

  async deleteSession(sessionId: WorkspaceSessionId): Promise<void> {
    await this.ensureInitialized();
    const db = this.getDb();
    const statements = this.getStatements();

    const deleteTransaction = db.transaction((id: WorkspaceSessionId) => {
      statements.deleteMessagesBySession.run(id);
      statements.deleteSession.run(id);
    });

    deleteTransaction(sessionId);
  }

  async getChatMessages(sessionId: WorkspaceSessionId): Promise<WorkspaceChatMessage[]> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const rows: MessageRow[] = statements.selectMessagesBySession.all(sessionId);
    return rows.map((row) => this.mapMessageRow(row));
  }

  async addChatMessage(
    sessionId: WorkspaceSessionId,
    payload: WorkspaceChatMessagePayload
  ): Promise<WorkspaceChatMessage> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const sessionRow = statements.selectSessionById.get(sessionId) as SessionRow | undefined;

    if (!sessionRow) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date().toISOString();
    const messageId = uuidv4();
    const metadata = payload.metadata ?? {};

    statements.insertMessage.run(
      messageId,
      sessionId,
      payload.role,
      payload.content,
      now,
      serializeMetadata(metadata)
    );

    statements.updateSessionTimestamps.run(now, now, sessionId);

    const message: WorkspaceChatMessage = {
      id: messageId,
      sessionId,
      role: payload.role,
      content: payload.content,
      createdAt: now,
      metadata
    };

    return message;
  }

  async deleteChatMessage(sessionId: WorkspaceSessionId, messageId: string): Promise<void> {
    await this.ensureInitialized();
    const statements = this.getStatements();

    const result = statements.deleteMessage.run(messageId, sessionId);
    if (result.changes > 0) {
      const latest = statements.selectLatestMessageTimestamp.get(sessionId) as
        | { created_at: string }
        | undefined;
      const now = new Date().toISOString();
      const lastMessageAt = latest?.created_at ?? null;
      statements.updateSessionTimestamps.run(now, lastMessageAt, sessionId);
    }
  }

  async clearChatMessages(sessionId: WorkspaceSessionId): Promise<void> {
    await this.ensureInitialized();
    const statements = this.getStatements();
    const result = statements.deleteMessagesBySession.run(sessionId);

    if (result.changes > 0) {
      const now = new Date().toISOString();
      statements.updateSessionTimestamps.run(now, null, sessionId);
    }
  }

  private async initialize(): Promise<void> {
    await this.ensureDataDirectory();

    const db = new DatabaseConstructor(this.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    this.db = db;
    this.createSchema(db);
    await this.migrateFromJson(db);
    this.statements = this.prepareStatements(db);
  }

  private getDb(): BetterSqliteDatabase {
    if (!this.db) {
      throw new Error("WorkspaceService is not initialized");
    }
    return this.db;
  }

  private getStatements(): PreparedStatements {
    if (!this.statements) {
      throw new Error("WorkspaceService statements are not prepared");
    }
    return this.statements;
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
  }

  private createSchema(db: BetterSqliteDatabase): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        last_message_at TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS workspace_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES workspace_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_messages_session_id
        ON workspace_messages (session_id);

      CREATE INDEX IF NOT EXISTS idx_workspace_messages_session_created_at
        ON workspace_messages (session_id, created_at);
    `);
  }

  private prepareStatements(db: BetterSqliteDatabase): PreparedStatements {
    return {
      selectSessions: db.prepare(`
        SELECT id, name, description, created_at, updated_at, last_message_at, metadata
        FROM workspace_sessions
        ORDER BY COALESCE(updated_at, created_at) DESC
      `),
      selectSessionById: db.prepare(`
        SELECT id, name, description, created_at, updated_at, last_message_at, metadata
        FROM workspace_sessions
        WHERE id = ?
      `),
      insertSession: db.prepare(`
        INSERT INTO workspace_sessions (id, name, description, created_at, updated_at, last_message_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      updateSessionData: db.prepare(`
        UPDATE workspace_sessions
        SET name = ?, description = ?, metadata = ?, updated_at = ?, last_message_at = ?
        WHERE id = ?
      `),
      updateSessionTimestamps: db.prepare(`
        UPDATE workspace_sessions
        SET updated_at = ?, last_message_at = ?
        WHERE id = ?
      `),
      deleteSession: db.prepare(`
        DELETE FROM workspace_sessions
        WHERE id = ?
      `),
      insertMessage: db.prepare(`
        INSERT INTO workspace_messages (id, session_id, role, content, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      selectMessagesBySession: db.prepare(`
        SELECT id, session_id, role, content, created_at, metadata
        FROM workspace_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
      `),
      deleteMessage: db.prepare(`
        DELETE FROM workspace_messages
        WHERE id = ? AND session_id = ?
      `),
      deleteMessagesBySession: db.prepare(`
        DELETE FROM workspace_messages
        WHERE session_id = ?
      `),
      selectLatestMessageTimestamp: db.prepare(`
        SELECT created_at
        FROM workspace_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
    };
  }

  private mapSessionRow(row: SessionRow): WorkspaceSession {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      lastMessageAt: row.last_message_at ?? undefined,
      metadata: parseMetadata(row.metadata)
    };
  }

  private mapMessageRow(row: MessageRow): WorkspaceChatMessage {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role as WorkspaceChatMessage["role"],
      content: row.content,
      createdAt: row.created_at,
      metadata: parseMetadata(row.metadata)
    };
  }

  private async migrateFromJson(db: BetterSqliteDatabase): Promise<void> {
    const legacyPath = path.join(this.workspacePath, ".workspace", "data.json");

    let content: string;
    try {
      content = await fs.readFile(legacyPath, "utf-8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    const count = db.prepare("SELECT COUNT(1) as count FROM workspace_sessions").get() as { count: number };
    if (count.count > 0) {
      await this.backupLegacyFile(legacyPath);
      return;
    }

    let legacyData: LegacyWorkspaceData | undefined;
    try {
      legacyData = JSON.parse(content) as LegacyWorkspaceData;
    } catch {
      await this.backupLegacyFile(legacyPath);
      return;
    }

    if (
      !legacyData ||
      !Array.isArray(legacyData.sessions) ||
      typeof legacyData.messages !== "object" ||
      legacyData.messages === null
    ) {
      await this.backupLegacyFile(legacyPath);
      return;
    }

    const insertSession = db.prepare(`
      INSERT INTO workspace_sessions (id, name, description, created_at, updated_at, last_message_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMessage = db.prepare(`
      INSERT INTO workspace_messages (id, session_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const migrateTransaction = db.transaction((data: LegacyWorkspaceData) => {
      for (const session of data.sessions) {
        const sessionMessages = data.messages[session.id] ?? [];
        const lastMessage =
          session.lastMessageAt ??
          (sessionMessages.length > 0 ? sessionMessages[sessionMessages.length - 1].createdAt : undefined);

        insertSession.run(
          session.id,
          session.name,
          session.description ?? null,
          session.createdAt,
          session.updatedAt ?? null,
          lastMessage ?? null,
          serializeMetadata(session.metadata)
        );

        for (const message of sessionMessages) {
          insertMessage.run(
            message.id,
            session.id,
            message.role,
            message.content,
            message.createdAt,
            serializeMetadata(message.metadata as Record<string, unknown> | undefined)
          );
        }
      }
    });

    migrateTransaction(legacyData);
    await this.backupLegacyFile(legacyPath);
  }

  private async backupLegacyFile(filePath: string): Promise<void> {
    const backupPath = `${filePath}.bak`;
    try {
      await fs.rename(filePath, backupPath);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        const uniqueBackupPath = `${filePath}.${Date.now()}.bak`;
        await fs.rename(filePath, uniqueBackupPath);
        return;
      }

      await fs.rm(filePath, { force: true });
    }
  }
}
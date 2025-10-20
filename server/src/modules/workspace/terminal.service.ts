import { spawn, ChildProcess } from 'node:child_process';
import { v4 as uuidv4 } from 'uuid';
import type { WorkspaceTerminalSession, WorkspaceTerminalCommandPayload, WorkspaceTerminalCommandResponse } from '../../types/workspace';

interface TerminalProcess {
  process: ChildProcess;
  sessionId: string;
  workingDirectory: string;
  createdAt: string;
}

export class TerminalService {
  private terminals: Map<string, TerminalProcess> = new Map();

  constructor(private workspacePath: string) {}

  async createSession(sessionId: string): Promise<WorkspaceTerminalSession> {
    const terminalId = uuidv4();
    const now = new Date().toISOString();

    // Создаем терминальный процесс
    const terminalProcess = spawn('/bin/bash', [], {
      cwd: this.workspacePath,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PWD: this.workspacePath
      }
    });

    const terminalInfo: TerminalProcess = {
      process: terminalProcess,
      sessionId,
      workingDirectory: this.workspacePath,
      createdAt: now
    };

    this.terminals.set(terminalId, terminalInfo);

    // Обработка завершения процесса
    terminalProcess.on('close', (code) => {
      console.log(`Terminal process ${terminalId} exited with code ${code}`);
      this.terminals.delete(terminalId);
    });

    terminalProcess.on('error', (error) => {
      console.error(`Terminal process ${terminalId} error:`, error);
      this.terminals.delete(terminalId);
    });

    return {
      id: terminalId,
      sessionId,
      createdAt: now,
      status: 'active',
      metadata: {
        shell: '/bin/bash',
        workingDirectory: this.workspacePath,
        environment: {
          TERM: 'xterm-256color',
          SHELL: '/bin/bash',
          USER: process.env.USER || 'workspace-user',
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          PWD: this.workspacePath
        }
      }
    };
  }

  async executeCommand(
    terminalId: string,
    command: WorkspaceTerminalCommandPayload
  ): Promise<WorkspaceTerminalCommandResponse> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal ${terminalId} not found`);
    }

    const commandId = uuidv4();
    const acknowledgedAt = new Date().toISOString();

    // Отправляем команду в терминал
    if (terminal.process.stdin) {
      terminal.process.stdin.write(command.command + '\n');
    }

    return {
      commandId,
      acknowledgedAt,
      metadata: {
        sessionId: terminal.sessionId,
        command: command.command,
        workingDirectory: command.workingDirectory || terminal.workingDirectory,
        status: 'executing'
      }
    };
  }

  async closeSession(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.process.kill();
      this.terminals.delete(terminalId);
    }
  }

  getActiveTerminals(): string[] {
    return Array.from(this.terminals.keys());
  }

  isTerminalActive(terminalId: string): boolean {
    return this.terminals.has(terminalId);
  }
}
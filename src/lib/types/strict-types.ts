/**
 * Строгие типы для замены any в проекте
 * Все типы максимально конкретны и проверяемы в runtime
 */

import { Message } from '../types';

// ============================================================================
// WebSocket Protocol Types
// ============================================================================

export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export interface WorkspaceChatMessage extends WebSocketMessage {
  type: 'echo' | 'command' | 'connected';
  data?: unknown;
  timestamp?: string;
}

export interface TerminalMessage extends WebSocketMessage {
  type: 'command' | 'output';
  command?: string;
  commandId?: string;
  content?: string;
  timestamp?: string;
}

export interface WebSocketResponse {
  type: 'connected' | 'echo' | 'error' | 'output';
  sessionId?: string;
  data?: unknown;
  message?: string;
  commandId?: string;
  content?: string;
  timestamp: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
}

export interface ImageSession {
  id: string;
  title: string;
  messages: Message[];
  images: Array<{
    id: string;
    prompt: string;
    url: string;
    timestamp: Date;
  }>;
  timestamp: Date;
  model: string;
}

export interface WorkspaceChatEntry {
  id: string;
  question: string;
  answer: string;
  timestamp: Date;
  isTyping?: boolean;
}

export interface WorkspaceSession {
  id: string;
  title: string;
  name: string;
  description?: string;
  messages: Message[];
  timestamp: Date;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  metadata?: Record<string, unknown>;
}

export type AnySession = ChatSession | ImageSession | WorkspaceSession;

// ============================================================================
// Vector Database Metadata Types
// ============================================================================

export interface VectorDocumentMetadata {
  type: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface ProjectMapMetadata extends VectorDocumentMetadata {
  type: 'project_map';
  projectId: string;
  projectName: string;
  fileCount: number;
  totalSize: number;
  languages: string[];
  indexedAt: string;
}

export interface FileChunkMetadata extends VectorDocumentMetadata {
  type: 'project_file_chunk';
  projectId: string;
  projectName: string;
  fileName: string;
  filePath: string;
  chunkNumber: number;
  totalChunks: number;
  fileSize: number;
  language?: string;
}

export type VectorMetadata = ProjectMapMetadata | FileChunkMetadata | VectorDocumentMetadata;

// ============================================================================
// API Response Types
// ============================================================================

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string | null;
  logprobs?: unknown;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  system_fingerprint?: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface ImageStreamChunk {
  delta?: {
    image_url?: string | { url: string };
    content?: string;
  };
  message?: {
    content?: Array<{
      type?: string;
      image_url?: string | { url: string };
      text?: string;
    }>;
  };
  data?: unknown;
  response?: unknown;
  output?: unknown;
  content?: unknown;
}

// ============================================================================
// Express/Fastify Middleware Types
// ============================================================================

export interface NextFunction {
  (err?: Error | unknown): void;
}

export interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  [key: string]: unknown;
}

export interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(data: unknown): ExpressResponse;
  send(data: unknown): ExpressResponse;
  setHeader(name: string, value: string | number | string[]): void;
  end(): void;
  [key: string]: unknown;
}

export type NextHandleFunction = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => void;

// ============================================================================
// Monaco Editor Types
// ============================================================================

export interface MonacoInstance {
  editor: {
    create: (container: HTMLElement, options: MonacoEditorOptions) => MonacoEditor;
    defineTheme: (name: string, theme: MonacoTheme) => void;
    setTheme: (name: string) => void;
  };
  languages: {
    register: (language: { id: string }) => void;
    setMonarchTokensProvider: (languageId: string, provider: unknown) => void;
  };
}

export interface MonacoEditor {
  getValue(): string;
  setValue(value: string): void;
  dispose(): void;
  layout(): void;
  onDidChangeModelContent(listener: () => void): { dispose: () => void };
  getModel(): MonacoModel | null;
}

export interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
}

export interface MonacoEditorOptions {
  value?: string;
  language?: string;
  theme?: string;
  readOnly?: boolean;
  minimap?: { enabled: boolean };
  fontSize?: number;
  lineNumbers?: 'on' | 'off' | 'relative';
  automaticLayout?: boolean;
  scrollBeyondLastLine?: boolean;
  wordWrap?: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  [key: string]: unknown;
}

export interface MonacoTheme {
  base: 'vs' | 'vs-dark' | 'hc-black';
  inherit: boolean;
  rules: Array<{
    token: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;
  colors: Record<string, string>;
}

// ============================================================================
// SpeechRecognition Types
// ============================================================================

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

// ============================================================================
// Project Index Types
// ============================================================================

export interface ProjectIndex {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  totalSize: number;
  languages: string[];
  indexedAt: Date;
  lastModified: Date;
  metadata?: VectorDocumentMetadata;
  stats?: {
    totalFiles: number;
    totalSize: number;
    languages: Record<string, number>;
    fileTypes?: Record<string, number>;
    directories?: number;
    avgFileSize?: number;
    largestFile?: { name: string; size: number };
    oldestFile?: { name: string; date: Date };
    newestFile?: { name: string; date: Date };
  };
  configuration?: {
    ignorePatterns?: string[];
    indexTextFiles?: boolean;
    maxFileSize?: number;
    supportedLanguages?: string[];
    customRules?: Record<string, unknown>;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface ErrorWithDetails extends Error {
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isChatSession(session: AnySession): session is ChatSession {
  return 'messages' in session && !('images' in session);
}

export function isImageSession(session: AnySession): session is ImageSession {
  return 'images' in session && Array.isArray(session.images);
}

export function isWorkspaceSession(session: AnySession): session is WorkspaceSession {
  return 'messages' in session && !('images' in session);
}

export function isErrorWithDetails(error: unknown): error is ErrorWithDetails {
  return error instanceof Error && 'code' in error;
}

export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

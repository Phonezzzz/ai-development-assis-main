export type FileSystemEntryType = "file" | "directory";

export interface FileMetadata {
  name: string;
  path: string;
  type: FileSystemEntryType;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  extension?: string;
}

export interface FileTreeNode extends FileMetadata {
  children?: FileTreeNode[];
}

export interface FileChangeEvent {
  event: string;
  path: string;
  absolutePath: string;
  type: FileSystemEntryType | "unknown";
  timestamp: number;
}
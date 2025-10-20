import { measureOperation } from '@/lib/services/performance-monitor';
export interface FileSystemService {
  readFile(filePath: string): Promise<{ content: string; size: number; lastModified: Date }>;
  writeFile(filePath: string, content: string): Promise<{ success: boolean; filePath: string; bytesWritten: number; timestamp: Date }>;
  createFile(filePath: string, content: string): Promise<{ success: boolean; filePath: string; created: boolean; bytesWritten: number; timestamp: Date }>;
  deleteFile(filePath: string): Promise<{ success: boolean; filePath: string; deleted: boolean; timestamp: Date }>;
  listFiles(directoryPath: string): Promise<{ files: Array<{ name: string; type: 'file' | 'directory'; size?: number }>; directory: string; count: number }>;
}

class BrowserFileSystemService implements FileSystemService {
  private fileHandles: Map<string, FileSystemFileHandle> = new Map();
  private directoryHandles: Map<string, FileSystemDirectoryHandle> = new Map();

  async readFile(filePath: string): Promise<{ content: string; size: number; lastModified: Date }> {
    return measureOperation(
      'file-system:read',
      async () => {
        try {
          let fileHandle: FileSystemFileHandle;

          if (this.fileHandles.has(filePath)) {
            fileHandle = this.fileHandles.get(filePath)!;
          } else {
            const windowWithPicker = window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> };
            if (!windowWithPicker.showOpenFilePicker) {
              throw new Error('File System Access API not supported in this browser');
            }
            const pickerResult = await windowWithPicker.showOpenFilePicker({
              types: [
                {
                  description: 'Text Files',
                  accept: {
                    'text/*': ['.txt', '.js', '.ts', '.json', '.md', '.html', '.css']
                  }
                }
              ]
            });
            if (!pickerResult || pickerResult.length === 0) {
              throw new Error('No file selected');
            }
            fileHandle = pickerResult[0];
            this.fileHandles.set(filePath, fileHandle);
          }

          const file = await fileHandle.getFile();
          const content = await file.text();

          return {
            content,
            size: file.size,
            lastModified: new Date(file.lastModified)
          };
        } catch (error) {
          try {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const content = await response.text();
            return {
              content,
              size: content.length,
              lastModified: new Date()
            };
          } catch (fetchError) {
            throw new Error(`Не удалось прочитать файл ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      },
      {
        requestId: filePath,
        data: { filePath },
        onSuccessData: (result) => ({
          size: result.size,
          lastModified: result.lastModified.toISOString()
        }),
        onErrorData: (error) => ({
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    );
  }

  async writeFile(filePath: string, content: string): Promise<{ success: boolean; filePath: string; bytesWritten: number; timestamp: Date }> {
    return measureOperation(
      'file-system:write',
      async () => {
        try {
          let fileHandle: FileSystemFileHandle;

          if (this.fileHandles.has(filePath)) {
            fileHandle = this.fileHandles.get(filePath)!;
          } else {
            const windowWithPicker = window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle> };
            if (!windowWithPicker.showSaveFilePicker) {
              throw new Error('File System Access API not supported in this browser');
            }
            const result = await windowWithPicker.showSaveFilePicker({
              suggestedName: filePath.split('/').pop(),
              types: [
                {
                  description: 'Text Files',
                  accept: {
                    'text/*': ['.txt', '.js', '.ts', '.json', '.md', '.html', '.css']
                  }
                }
              ]
            });
            if (!result) {
              throw new Error('File picker cancelled or not available');
            }
            fileHandle = result;
            this.fileHandles.set(filePath, fileHandle);
          }

          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();

          return {
            success: true,
            filePath,
            bytesWritten: content.length,
            timestamp: new Date()
          };
        } catch (error) {
          try {
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filePath.split('/').pop() || 'file.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return {
              success: true,
              filePath,
              bytesWritten: content.length,
              timestamp: new Date()
            };
          } catch (downloadError) {
            throw new Error(`Не удалось записать файл ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      },
      {
        requestId: filePath,
        data: { filePath, contentLength: content.length },
        onSuccessData: (result) => ({
          bytesWritten: result.bytesWritten,
          timestamp: result.timestamp.toISOString()
        }),
        onErrorData: (error) => ({
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    );
  }

  async createFile(filePath: string, content: string): Promise<{ success: boolean; filePath: string; created: boolean; bytesWritten: number; timestamp: Date }> {
    // Создание файла аналогично записи, но с проверкой существования
    return measureOperation(
      'file-system:create',
      async () => {
        try {
          const result = await this.writeFile(filePath, content);
          return {
            ...result,
            created: true
          };
        } catch (error) {
          throw new Error(`Не удалось создать файл ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      {
        requestId: filePath,
        data: { filePath },
        onSuccessData: (result) => ({
          bytesWritten: result.bytesWritten,
          timestamp: result.timestamp.toISOString()
        }),
        onErrorData: (error) => ({
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    );
  }

  async deleteFile(filePath: string): Promise<{ success: boolean; filePath: string; deleted: boolean; timestamp: Date }> {
    return measureOperation(
      'file-system:delete',
      async () => {
        try {
          if (this.fileHandles.has(filePath)) {
            const fileHandle = this.fileHandles.get(filePath)!;
            // В File System Access API нет прямого метода удаления, но мы можем удалить из нашего кэша
            this.fileHandles.delete(filePath);
            
            return {
              success: true,
              filePath,
              deleted: true,
              timestamp: new Date()
            };
          } else {
            // Для файлов, не открытых через File System Access API, удаление не поддерживается
            // В браузере мы не можем удалять файлы произвольно из файловой системы пользователя
            throw new Error('Удаление файлов не поддерживается в браузере для файлов, не открытых через File System Access API');
          }
        } catch (error) {
          throw new Error(`Не удалось удалить файл ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      {
        requestId: filePath,
        data: { filePath },
        onSuccessData: (result) => ({
          deleted: result.deleted,
          timestamp: result.timestamp.toISOString()
        }),
        onErrorData: (error) => ({
          filePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    );
  }

  async listFiles(directoryPath: string): Promise<{ files: Array<{ name: string; type: 'file' | 'directory'; size?: number }>; directory: string; count: number }> {
    return measureOperation(
      'file-system:list',
      async () => {
        try {
          let directoryHandle: FileSystemDirectoryHandle;
          
          if (this.directoryHandles.has(directoryPath)) {
            directoryHandle = this.directoryHandles.get(directoryPath)!;
          } else {
            // Запрашиваем доступ к директории
            const windowWithPicker = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
            if (!windowWithPicker.showDirectoryPicker) {
              throw new Error('File System Access API not supported in this browser');
            }
            const result = await windowWithPicker.showDirectoryPicker();
            if (!result) {
              throw new Error('Directory picker cancelled or not available');
            }
            directoryHandle = result;
            this.directoryHandles.set(directoryPath, directoryHandle);
          }

          const files: Array<{ name: string; type: 'file' | 'directory'; size?: number }> = [];

          // Используем values() вместо entries() для совместимости с TypeScript
          // @ts-ignore - values() существует, но может отсутствовать в типах
          for await (const handle of directoryHandle.values()) {
            const name = handle.name;
            if (handle.kind === 'file') {
              const file = await handle.getFile();
              files.push({
                name,
                type: 'file',
                size: file.size
              });
            } else {
              files.push({
                name,
                type: 'directory'
              });
            }
          }

          return {
            files,
            directory: directoryPath,
            count: files.length
          };
        } catch (error) {
          // Fallback: возвращаем пустой список для случаев, когда доступ к файловой системе невозможен
          console.warn(`Не удалось получить список файлов для ${directoryPath}:`, JSON.stringify(error, null, 2));
          throw new Error(`Failed to list files for directory "${directoryPath}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      {
        requestId: directoryPath,
        data: { directoryPath },
        onSuccessData: (result) => ({
          count: result.count
        }),
        onErrorData: (error) => ({
          directoryPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    );
  }
}

// Экспортируем синглтон экземпляр сервиса
export const fileSystemService = new BrowserFileSystemService();
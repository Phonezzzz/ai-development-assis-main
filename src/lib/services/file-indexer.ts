import { ProjectFile } from '@/lib/types';
import { vectorService } from './vector';
import { toast } from 'sonner';

export interface ProjectIndex {
  id: string;
  name: string;
  rootPath: string;
  files: ProjectFile[];
  structure: FileTreeNode;
  createdAt: Date;
  updatedAt: Date;
  stats: ProjectStats;
  configuration?: ProjectConfiguration;
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileTreeNode[];
  metadata?: {
    language?: string;
    extension?: string;
    lastModified?: Date;
    isTextFile?: boolean;
    isBinary?: boolean;
  };
}

export interface ProjectStats {
  totalFiles: number;
  totalSize: number;
  languages: Record<string, number>;
  fileTypes: Record<string, number>;
  directories: number;
  avgFileSize: number;
  largestFile: { name: string; size: number };
  oldestFile: { name: string; date: Date };
  newestFile: { name: string; date: Date };
}

export interface ProjectConfiguration {
  ignorePatterns: string[];
  indexTextFiles: boolean;
  maxFileSize: number;
  supportedLanguages: string[];
  customRules: Record<string, any>;
}

export class FileIndexerService {
  private readonly supportedExtensions = new Set([
    // Code files
    'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
    'py', 'rb', 'php', 'java', 'kt', 'scala', 'clj',
    'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
    'cs', 'vb', 'fs', 'go', 'rs', 'swift',
    'dart', 'lua', 'perl', 'r', 'matlab',
    
    // Markup and data
    'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less',
    'json', 'yaml', 'yml', 'toml', 'ini', 'cfg',
    'md', 'mdx', 'rst', 'txt', 'rtf',
    
    // Config files
    'dockerfile', 'dockerignore', 'gitignore',
    'eslintrc', 'prettierrc', 'babelrc',
    'package', 'lock', 'gemfile', 'requirements',
    
    // Other
    'sql', 'graphql', 'proto', 'thrift'
  ]);

  private readonly defaultIgnorePatterns = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'tmp/**',
    'temp/**',
    '*.log',
    '*.cache',
    '.DS_Store',
    'Thumbs.db'
  ];

  async indexProject(
    files: FileList,
    options: {
      name?: string;
      ignorePatterns?: string[];
      maxFileSize?: number;
    } = {}
  ): Promise<ProjectIndex> {
    const startTime = Date.now();
    const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Extract root path
      const rootPath = this.extractRootPath(files);
      const projectName = options.name || rootPath || 'Новый проект';
      
      // Filter files
      const filteredFiles = this.filterFiles(files, options.ignorePatterns);
      
      // Process files
      const projectFiles = await this.processFiles(filteredFiles, projectId, options.maxFileSize);
      
      // Build file tree structure
      const structure = this.buildFileTree(projectFiles);
      
      // Calculate statistics
      const stats = this.calculateStats(projectFiles);
      
      // Create project index
      const projectIndex: ProjectIndex = {
        id: projectId,
        name: projectName,
        rootPath,
        files: projectFiles,
        structure,
        createdAt: new Date(),
        updatedAt: new Date(),
        stats,
        configuration: {
          ignorePatterns: options.ignorePatterns || this.defaultIgnorePatterns,
          indexTextFiles: true,
          maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
          supportedLanguages: Array.from(this.supportedExtensions),
          customRules: {},
        },
      };

      // Index text files in vector database
      await this.indexTextFilesInVector(projectFiles, projectIndex);
      
      // Create a serializable version of the project index without file content
      const serializableProjectIndex = {
        ...projectIndex,
        files: projectIndex.files.map(file => ({
          ...file,
          content: undefined, // Remove content to keep the map small
        })),
      };

      // Store project map in vector database
      await vectorService.addDocument({
        id: `project_map_${projectId}`,
        content: JSON.stringify(serializableProjectIndex, null, 2),
        metadata: {
          type: 'project_map',
          projectId,
          projectName,
          fileCount: projectFiles.length,
          totalSize: stats.totalSize,
          languages: Object.keys(stats.languages),
          indexedAt: new Date().toISOString(),
        },
      });

      const duration = Date.now() - startTime;
      toast.success(`Проект "${projectName}" проиндексирован за ${duration}ms`);
      
      return projectIndex;
    } catch (error) {
      console.error('Error indexing project:', error);
      toast.error('Ошибка при индексации проекта');
      throw error;
    }
  }

  async reindexProject(projectIndex: ProjectIndex, newFiles: FileList): Promise<ProjectIndex> {
    // Similar to indexProject but updates existing index
    const filteredFiles = this.filterFiles(newFiles, projectIndex.configuration?.ignorePatterns);
    const projectFiles = await this.processFiles(filteredFiles, projectIndex.id, projectIndex.configuration?.maxFileSize);
    
    const updatedIndex: ProjectIndex = {
      ...projectIndex,
      files: [...projectIndex.files, ...projectFiles],
      structure: this.buildFileTree([...projectIndex.files, ...projectFiles]),
      stats: this.calculateStats([...projectIndex.files, ...projectFiles]),
      updatedAt: new Date(),
    };

    await this.indexTextFilesInVector(projectFiles, updatedIndex);
    
    return updatedIndex;
  }

  private extractRootPath(files: FileList): string {
    if (files.length === 0) return '';
    
    const firstFile = files[0];
    const path = firstFile.webkitRelativePath || firstFile.name;
    const parts = path.split('/');
    
    return parts.length > 1 ? parts[0] : '';
  }

  private filterFiles(files: FileList, ignorePatterns?: string[]): File[] {
    const patterns = ignorePatterns || this.defaultIgnorePatterns;
    const filteredFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.webkitRelativePath || file.name;
      
      // Check if file should be ignored
      const shouldIgnore = patterns.some(pattern => {
        // Convert glob pattern to regex
        const regex = new RegExp(
          pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
        );
        return regex.test(path);
      });

      if (!shouldIgnore) {
        filteredFiles.push(file);
      }
    }

    return filteredFiles;
  }

  private async processFiles(
    files: File[],
    projectId: string,
    maxFileSize: number = 10 * 1024 * 1024
  ): Promise<ProjectFile[]> {
    const projectFiles: ProjectFile[] = [];

    for (const file of files) {
      try {
        // Skip files that are too large
        if (file.size > maxFileSize) {
          console.warn(`Skipping large file: ${file.name} (${file.size} bytes)`);
          continue;
        }

        const extension = this.getFileExtension(file.name);
        const isTextFile = this.isTextFile(file, extension);
        
        let content = '';
        if (isTextFile && file.size < 1024 * 1024) { // 1MB limit for content reading
          content = await this.readFileAsText(file);
        }

        const projectFile: ProjectFile = {
          id: `${projectId}_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          path: file.webkitRelativePath || file.name,
          type: file.type || this.getMimeType(extension),
          size: file.size,
          content,
          lastModified: new Date(file.lastModified),
          metadata: {
            extension,
            language: this.getLanguageFromExtension(extension),
            isTextFile,
            isBinary: !isTextFile,
            projectId,
          },
        };

        projectFiles.push(projectFile);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    return projectFiles;
  }

  private buildFileTree(files: ProjectFile[]): FileTreeNode {
    const root: FileTreeNode = {
      name: 'root',
      type: 'directory',
      path: '',
      children: [],
    };

    files.forEach(file => {
      const pathParts = file.path.split('/').filter(part => part.length > 0);
      this.addToFileTree(root, pathParts, file);
    });

    return root;
  }

  private addToFileTree(parent: FileTreeNode, pathParts: string[], file: ProjectFile): void {
    if (pathParts.length === 0) return;

    if (pathParts.length === 1) {
      // This is a file
      parent.children = parent.children || [];
      parent.children.push({
        name: pathParts[0],
        type: 'file',
        path: file.path,
        size: file.size,
        metadata: {
          language: file.metadata?.language,
          extension: file.metadata?.extension,
          lastModified: file.lastModified,
          isTextFile: file.metadata?.isTextFile,
          isBinary: file.metadata?.isBinary,
        },
      });
    } else {
      // This is a directory
      const dirName = pathParts[0];
      parent.children = parent.children || [];
      
      let dir = parent.children.find(child => child.name === dirName && child.type === 'directory');
      if (!dir) {
        dir = {
          name: dirName,
          type: 'directory',
          path: file.path.split('/').slice(0, -pathParts.length + 1).join('/'),
          children: [],
        };
        parent.children.push(dir);
      }
      
      this.addToFileTree(dir, pathParts.slice(1), file);
    }
  }

  private calculateStats(files: ProjectFile[]): ProjectStats {
    const languages: Record<string, number> = {};
    const fileTypes: Record<string, number> = {};
    let totalSize = 0;
    let directories = 0;
    let largestFile = { name: '', size: 0 };
    let oldestFile = { name: '', date: new Date() };
    let newestFile = { name: '', date: new Date(0) };

    files.forEach(file => {
      totalSize += file.size;
      
      // Track languages
      const language = file.metadata?.language || 'Unknown';
      languages[language] = (languages[language] || 0) + 1;
      
      // Track file types
      const extension = file.metadata?.extension || 'no-ext';
      fileTypes[extension] = (fileTypes[extension] || 0) + 1;
      
      // Find largest file
      if (file.size > largestFile.size) {
        largestFile = { name: file.name, size: file.size };
      }
      
      // Find oldest and newest files
      if (file.lastModified < oldestFile.date) {
        oldestFile = { name: file.name, date: file.lastModified };
      }
      if (file.lastModified > newestFile.date) {
        newestFile = { name: file.name, date: file.lastModified };
      }
      
      // Count directories (approximation)
      if (file.path.includes('/')) {
        directories++;
      }
    });

    return {
      totalFiles: files.length,
      totalSize,
      languages,
      fileTypes,
      directories,
      avgFileSize: files.length > 0 ? totalSize / files.length : 0,
      largestFile,
      oldestFile,
      newestFile,
    };
  }

  private async indexTextFilesInVector(files: ProjectFile[], projectIndex: ProjectIndex): Promise<void> {
    const textFiles = files.filter(file =>
      file.metadata?.isTextFile &&
      file.content &&
      file.content.length > 0
    );

    for (const file of textFiles) {
      try {
        // Use token-aware chunking instead of character-based chunking
        const chunks = this.chunkTextByTokens(file.content || '', 2000); // Chunk by ~2000 tokens (safe for 8192 limit)

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          // Skip empty chunks
          if (chunk.trim().length === 0) continue;

          await vectorService.addDocument({
            id: `${projectIndex.id}_${file.id}_chunk_${i}`,
            content: chunk,
            metadata: {
              type: 'project_file_chunk',
              projectId: projectIndex.id,
              projectName: projectIndex.name,
              fileName: file.name,
              filePath: file.path,
              chunkNumber: i,
              totalChunks: chunks.length,
              fileSize: file.size,
              language: file.metadata?.language,
              extension: file.metadata?.extension,
              lastModified: file.lastModified.toISOString(),
              indexedAt: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        console.error(`Error indexing file ${file.name}:`, error);
        // Continue processing other files even if one fails
      }
    }
  }

  private chunkText(text: string, chunkSizeInChars: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSizeInChars) {
      chunks.push(text.substring(i, i + chunkSizeInChars));
    }
    return chunks;
  }

  private chunkTextByTokens(text: string, maxTokens: number): string[] {
    const chunks: string[] = [];

    // Rough token estimation: 1 token ≈ 4 characters on average for English
    // For code and technical content, it's more conservative: 1 token ≈ 3 characters
    const estimatedCharsPerToken = 3;
    const maxCharsPerChunk = maxTokens * estimatedCharsPerToken;

    // Split by lines first to avoid breaking code structure
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line;

      // If adding this line would exceed the limit, start a new chunk
      if (potentialChunk.length > maxCharsPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = potentialChunk;
      }

      // If a single line is too long, split it by words
      if (currentChunk.length > maxCharsPerChunk) {
        const words = currentChunk.split(' ');
        let wordChunk = '';

        for (const word of words) {
          const potentialWordChunk = wordChunk + (wordChunk ? ' ' : '') + word;

          if (potentialWordChunk.length > maxCharsPerChunk && wordChunk.length > 0) {
            chunks.push(wordChunk);
            wordChunk = word;
          } else {
            wordChunk = potentialWordChunk;
          }
        }

        currentChunk = wordChunk;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  private isTextFile(file: File, extension: string): boolean {
    // Check if it's a known text extension
    if (this.supportedExtensions.has(extension)) {
      return true;
    }

    // Check MIME type
    if (file.type.startsWith('text/')) {
      return true;
    }

    // Special cases
    const textPatterns = [
      /^text\//,
      /application\/json/,
      /application\/xml/,
      /application\/javascript/,
      /application\/typescript/,
    ];

    return textPatterns.some(pattern => pattern.test(file.type));
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'jsx': 'application/javascript',
      'tsx': 'application/typescript',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'py': 'text/x-python',
      'java': 'text/x-java',
      'cpp': 'text/x-c++src',
      'c': 'text/x-csrc',
      'h': 'text/x-chdr',
      'xml': 'application/xml',
      'yaml': 'application/x-yaml',
      'yml': 'application/x-yaml',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  private getLanguageFromExtension(extension: string): string {
    const langMap: Record<string, string> = {
      'js': 'JavaScript',
      'jsx': 'JavaScript',
      'ts': 'TypeScript',
      'tsx': 'TypeScript',
      'py': 'Python',
      'java': 'Java',
      'kt': 'Kotlin',
      'scala': 'Scala',
      'clj': 'Clojure',
      'c': 'C',
      'cpp': 'C++',
      'cc': 'C++',
      'cxx': 'C++',
      'h': 'C Header',
      'hpp': 'C++ Header',
      'cs': 'C#',
      'vb': 'Visual Basic',
      'fs': 'F#',
      'go': 'Go',
      'rs': 'Rust',
      'swift': 'Swift',
      'dart': 'Dart',
      'php': 'PHP',
      'rb': 'Ruby',
      'lua': 'Lua',
      'perl': 'Perl',
      'r': 'R',
      'matlab': 'MATLAB',
      'html': 'HTML',
      'xml': 'XML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'less': 'Less',
      'json': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'toml': 'TOML',
      'ini': 'INI',
      'cfg': 'Config',
      'md': 'Markdown',
      'rst': 'reStructuredText',
      'txt': 'Text',
      'sql': 'SQL',
      'graphql': 'GraphQL',
      'proto': 'Protocol Buffers',
      'dockerfile': 'Dockerfile',
    };

    return langMap[extension] || 'Unknown';
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async searchInProject(projectId: string, query: string, options?: {
    fileTypes?: string[];
    languages?: string[];
    maxResults?: number;
  }): Promise<ProjectFile[]> {
    try {
      const searchOptions = {
        limit: options?.maxResults || 20,
        filter: {
          projectId,
          type: 'project_file',
          ...(options?.languages && { language: { $in: options.languages } }),
          ...(options?.fileTypes && { extension: { $in: options.fileTypes } }),
        },
      };

      const results = await vectorService.search(query, searchOptions);
      
      return results.map(doc => ({
        id: doc.metadata.fileName,
        name: doc.metadata.fileName,
        path: doc.metadata.filePath,
        type: doc.metadata.fileType || 'text/plain',
        size: doc.metadata.fileSize || 0,
        content: doc.content,
        lastModified: new Date(doc.metadata.lastModified),
        metadata: {
          language: doc.metadata.language,
          extension: doc.metadata.extension,
          projectId: doc.metadata.projectId,
          similarity: doc.similarity,
        },
      }));
    } catch (error) {
      console.error('Error searching in project:', error);
      return [];
    }
  }
}

export const fileIndexerService = new FileIndexerService();
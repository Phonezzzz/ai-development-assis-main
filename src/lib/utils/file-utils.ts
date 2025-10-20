/**
 * Единая система определения типа файла и языка программирования.
 * ГЛАВНОЕ: всё определение в одном месте - нет fallback-ов!
 */

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Определить MIME-type по расширению файла.
 * Гарантирует, что MIME-type всегда корректный (никогда undefined).
 */
export function getMimeType(extension: string): string {
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

  // Гарантированно возвращаем валидный MIME-type
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Определить язык программирования по расширению файла.
 * Гарантирует, что язык всегда определён (никогда undefined).
 */
export function getLanguageFromExtension(extension: string): string {
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

  // Гарантированно возвращаем корректный язык
  return langMap[extension] || 'Unknown';
}

/**
 * Определить, является ли файл текстовым по MIME-type и расширению.
 */
export function isTextFileByMime(mimeType: string): boolean {
  const textPatterns = [
    /^text\//,
    /application\/json/,
    /application\/xml/,
    /application\/javascript/,
    /application\/typescript/,
  ];

  return textPatterns.some(pattern => pattern.test(mimeType));
}

/**
 * Нормализировать путь файла.
 * webkitRelativePath существует только при drag-drop или webkitdirectory.
 * Гарантирует, что всегда вернёт корректный путь (никогда пустой/undefined).
 */
export function normalizeFilePath(file: File): string {
  // webkitRelativePath приоритет - он содержит полный путь от корня
  if (file.webkitRelativePath && file.webkitRelativePath.trim()) {
    return file.webkitRelativePath;
  }
  // Fallback - если webkitRelativePath отсутствует или пуста, используем имя файла
  return file.name;
}

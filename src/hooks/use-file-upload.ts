import { useState, useCallback } from 'react';
import { ProjectFile } from '@/lib/types';
import { getFileExtension, getMimeType, getLanguageFromExtension, isTextFileByMime, normalizeFilePath } from '@/lib/utils/file-utils';

export function useFileUpload() {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = useCallback(async (file: File): Promise<ProjectFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') {
          reject(new Error('FileReader result is not a string'));
          return;
        }
        const content = result;

        // Всегда используем utils функции - гарантируют корректные значения
        const extension = getFileExtension(file.name);
        const mimeType = getMimeType(extension);
        const language = getLanguageFromExtension(extension);
        const isTextFile = isTextFileByMime(mimeType) || isTextFileByMime(file.type);

        const projectFile: ProjectFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          path: normalizeFilePath(file),
          type: mimeType,
          size: file.size,
          content: content,
          lastModified: new Date(file.lastModified),
          metadata: {
            extension,
            language,
            isTextFile,
            isBinary: !isTextFile,
            projectId: '',
          },
        };
        
        resolve(projectFile);
      };

      reader.onerror = () => {
        reject(new Error(`FileReader error: ${reader.error?.message}`));
      };

      if (file.type.startsWith('text/') || file.name.endsWith('.json') ||
          file.name.endsWith('.js') || file.name.endsWith('.ts') ||
          file.name.endsWith('.tsx') || file.name.endsWith('.jsx') ||
          file.name.endsWith('.css') || file.name.endsWith('.html') ||
          file.name.endsWith('.md') || file.name.endsWith('.yml') ||
          file.name.endsWith('.yaml') || file.name.endsWith('.xml')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }, []);

  const handleFileUpload = useCallback(async (fileList: FileList) => {
    setIsProcessing(true);
    
    const fileArray = Array.from(fileList);
    const processedFiles: ProjectFile[] = [];
    
    for (const file of fileArray) {
      try {
        const processedFile = await processFile(file);
        processedFiles.push(processedFile);
      } catch (error) {
        console.error('Error processing file:', file.name, JSON.stringify(error, null, 2));
      }
    }
    
    setFiles((prev) => [...prev, ...processedFiles]);
    setIsProcessing(false);
    
    return processedFiles;
  }, [processFile]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter(file => file.id !== fileId));
  }, []);

  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFiles((prev) => prev.map(file => 
      file.id === fileId ? { ...file, content } : file
    ));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      await handleFileUpload(droppedFiles);
    }
  }, [handleFileUpload]);

  const getFileIcon = useCallback((file: ProjectFile) => {
    if (file.type.startsWith('image/')) return '🖼️';
    if (file.type.startsWith('video/')) return '🎥';
    if (file.type.startsWith('audio/')) return '🎵';
    if (file.type.includes('pdf')) return '📄';
    if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) return '📜';
    if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) return '📘';
    if (file.name.endsWith('.css')) return '🎨';
    if (file.name.endsWith('.html')) return '🌐';
    if (file.name.endsWith('.json')) return '📋';
    if (file.name.endsWith('.md')) return '📝';
    return '📁';
  }, []);

  return {
    files,
    isDragging,
    isProcessing,
    handleFileUpload,
    removeFile,
    updateFileContent,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getFileIcon,
  };
}
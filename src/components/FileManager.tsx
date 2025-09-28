import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ProjectFile } from '@/lib/types';
import { FileTreeNode } from '@/lib/services/file-indexer';
import { fileIndexerService } from '@/lib/services/file-indexer';
import { toast } from 'sonner';
import {
  Folder,
  FolderOpen,
  File as FileIcon,
  FileCode,
  Upload,
  Archive,
  MagnifyingGlass,
  Trash,
  Download,
  CaretRight,
  CaretDown
} from '@phosphor-icons/react';

interface FileManagerProps {
  files?: ProjectFile[];
  selectedFile?: ProjectFile | null;
  onFileSelect?: (file: ProjectFile) => void;
  onFileUpload?: (files: FileList) => void;
  onFileRemove?: (fileId: string) => void;
  onFileDownload?: (file: ProjectFile) => void;
  className?: string;
}

interface FileSystemNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileSystemNode[];
  metadata?: {
    language?: string;
    extension?: string;
    lastModified?: Date;
    isTextFile?: boolean;
    isBinary?: boolean;
  };
}

export function FileManager({
  files = [],
  selectedFile,
  onFileSelect,
  onFileUpload,
  onFileRemove,
  onFileDownload,
  className
}: FileManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('explorer');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [projectIndexes, setProjectIndexes] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isExpanded = (path: string) => expandedNodes[path] ?? false;
  const toggleNode = (path: string) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !(prev[path] ?? false) }));
  };

  const buildFileSystemTree = (files: ProjectFile[]): FileSystemNode => {
    const root: FileSystemNode = {
      name: 'root',
      type: 'directory',
      path: '',
      children: [],
    };

    files.forEach(file => {
      const pathParts = file.path.split('/').filter(part => part.length > 0);
      addToFileSystemTree(root, pathParts, file);
    });

    return root;
  };

  const addToFileSystemTree = (parent: FileSystemNode, pathParts: string[], file: ProjectFile): void => {
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
      
      addToFileSystemTree(dir, pathParts.slice(1), file);
    }
  };

  const renderFileTree = (node: FileSystemNode, depth: number = 0) => {
    if (!node || !node.children) return null;

    return (
      <div className="space-y-1">
        {node.children.map(child => {
          const paddingLeft = depth * 16;
          
          if (child.type === 'directory') {
            const expanded = isExpanded(child.path);
            return (
              <div key={child.path} className="mb-1">
                <div
                  className="flex items-center gap-2 p-1 rounded cursor-pointer hover:bg-accent/50 transition-colors"
                  style={{ paddingLeft }}
                  onClick={() => toggleNode(child.path)}
                >
                  <div className="flex items-center gap-1">
                    {expanded ? (
                      <CaretDown size={12} className="text-muted-foreground" />
                    ) : (
                      <CaretRight size={12} className="text-muted-foreground" />
                    )}
                    {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  </div>
                  <span className="text-sm font-medium truncate">{child.name}</span>
                </div>
                {expanded && child.children && (
                  <div className="ml-4">
                    {renderFileTree({ ...child, children: child.children }, depth + 1)}
                  </div>
                )}
              </div>
            );
          } else {
            const file = files.find(f => f.path === child.path);
            return (
              <div
                key={child.path}
                className={cn(
                  "flex items-center gap-2 p-1 rounded cursor-pointer hover:bg-accent/50 transition-colors",
                  selectedFile?.path === child.path && "bg-accent text-accent-foreground"
                )}
                style={{ paddingLeft }}
                onClick={() => file && onFileSelect?.(file)}
              >
                <FileCode size={14} />
                <span className="text-sm truncate flex-1">{child.name}</span>
                {child.metadata?.extension && (
                  <Badge variant="secondary" className="text-xs">
                    {child.metadata.extension}
                  </Badge>
                )}
              </div>
            );
          }
        })}
      </div>
    );
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && onFileUpload) {
      onFileUpload(files);
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const projectIndex = await fileIndexerService.indexProject(files, {
        name: files[0].webkitRelativePath?.split('/')[0] || 'New Project',
      });
      setProjectIndexes(prev => [...prev, projectIndex]);
      setSelectedProject(projectIndex);
      toast.success(`Проект "${projectIndex.name}" успешно загружен`);
    } catch (error) {
      console.error('Error indexing project:', error);
      toast.error('Ошибка при загрузке проекта');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0 && onFileUpload) {
      onFileUpload(droppedFiles);
    }
  };

  const fileSystemTree = buildFileSystemTree(files);
  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={cn("h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden", className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="p-3 border-b bg-background">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <FolderOpen size={16} />
              File Manager
            </h4>
          </div>

          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="explorer" className="flex items-center gap-1 text-xs">
              <Folder size={12} />
              Файлы
            </TabsTrigger>
            <TabsTrigger value="tree" className="flex items-center gap-1 text-xs">
              <FolderOpen size={12} />
              Дерево
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-1 text-xs">
              <Archive size={12} />
              Проекты
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="explorer" className="flex-1 p-3 space-y-3 mt-0">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск файлов..."
              className="pl-7 h-8 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
              <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                <span>
                  <Upload size={12} className="mr-1" />
                  Файлы
                </span>
              </Button>
            </label>

            <label className="flex-1">
              <input
                type="file"
                webkitdirectory=""
                multiple
                onChange={handleFolderUpload}
                className="hidden"
              />
              <Button variant="default" size="sm" className="w-full h-8 text-xs" asChild>
                <span>
                  <Archive size={12} className="mr-1" />
                  Папка
                </span>
              </Button>
            </label>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex-1 border-2 border-dashed rounded-lg p-4 transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            {filteredFiles.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">📁</div>
                <h3 className="font-medium mb-1 text-sm">Файлов нет</h3>
                <p className="text-xs text-muted-foreground">
                  Перетащите файлы или загрузите их
                </p>
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent/50 transition-colors group",
                        selectedFile?.id === file.id && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => onFileSelect?.(file)}
                    >
                      <FileIcon size={16} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onFileDownload && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFileDownload(file);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Download size={12} />
                          </Button>
                        )}
                        {onFileRemove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFileRemove(file.id);
                            }}
                            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <Trash size={12} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tree" className="flex-1 p-3 space-y-3 mt-0">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск в дереве файлов..."
              className="pl-7 h-8 text-sm"
            />
          </div>

          <ScrollArea className="h-64">
            {renderFileTree(fileSystemTree)}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="projects" className="flex-1 p-3 space-y-3 mt-0">
          <ScrollArea className="h-64">
            {projectIndexes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">🏗️</div>
                <h3 className="font-medium mb-1 text-sm">Проектов нет</h3>
                <p className="text-xs text-muted-foreground">
                  Загрузите папку для создания проекта
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectIndexes.map((project) => (
                  <Card
                    key={project.id}
                    className={cn(
                      "p-3 cursor-pointer hover:bg-accent/50 transition-colors",
                      selectedProject?.id === project.id && "bg-accent"
                    )}
                    onClick={() => setSelectedProject(project)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Archive size={14} />
                      <h4 className="font-medium truncate text-sm">{project.name}</h4>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {Object.keys(project.stats.languages).slice(0, 3).map(lang => (
                        <Badge key={lang} variant="secondary" className="text-xs h-5">
                          {lang}
                        </Badge>
                      ))}
                      {Object.keys(project.stats.languages).length > 3 && (
                        <Badge variant="secondary" className="text-xs h-5">
                          +{Object.keys(project.stats.languages).length - 3}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {project.stats.totalFiles} файлов • {Math.round(project.stats.totalSize / 1024)} KB
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
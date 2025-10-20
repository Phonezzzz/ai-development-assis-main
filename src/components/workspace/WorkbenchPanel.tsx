import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileManager } from '@/components/FileManager';
import { MonacoEditor } from './MonacoEditor';
import { Terminal } from './Terminal';
import { useWorkspaceFiles } from '@/hooks/use-workspace-files';
import { useEditorTabsStore } from '@/stores/editor-tabs-store';
import { ProjectFile } from '@/lib/types';
import { WorkspaceFileNode } from '@/types/workspace';

// Функция для преобразования WorkspaceFileNode в ProjectFile
const convertToProjectFile = (node: WorkspaceFileNode): ProjectFile => {
  const extension = node.path.split('.').pop() || '';
  const language = node.metadata?.language || 'unknown';

  return {
    id: node.path, // Используем путь как ID
    name: node.name,
    path: node.path,
    type: node.type, // Добавляем обязательное поле type
    size: node.size || 0,
    lastModified: node.lastModified ? new Date(node.lastModified) : new Date(),
    metadata: {
      language: typeof language === 'string' ? language : 'unknown',
      extension,
      isTextFile: true,
      isBinary: false,
      projectId: '',
      ...node.metadata
    }
  };
};

// Рекурсивная функция для получения всех файлов из дерева
const getAllFilesFromTree = (nodes: WorkspaceFileNode[]): ProjectFile[] => {
  const files: ProjectFile[] = [];
  
  const traverse = (node: WorkspaceFileNode) => {
    if (node.type === 'file') {
      files.push(convertToProjectFile(node));
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  return files;
};

export function WorkbenchPanel() {
  const [activeTab, setActiveTab] = useState('files');
  const { fileTree, openFile } = useWorkspaceFiles();
  const { tabs, activeTabId, getActiveTab } = useEditorTabsStore();

  // Преобразуем дерево файлов в массив ProjectFile
  const files = getAllFilesFromTree(fileTree);

  const handleFileSelect = async (file: ProjectFile) => {
    try {
      await openFile(file.path);
      setActiveTab('editor');
    } catch (error) {
      console.error('Failed to open file:', JSON.stringify(error, null, 2));
    }
  };

  const activeEditorTab = getActiveTab();

  return (
    <div className="h-full flex flex-col rounded-2xl bg-neutral-2/85 shadow-[0_0_28px_rgba(255,102,0,0.24)] backdrop-blur-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col gap-4 p-4">
        <div className="rounded-2xl bg-neutral-1/85 shadow-[0_0_18px_rgba(255,102,0,0.18)] p-1">
          <TabsList className="w-full grid grid-cols-3 h-10 rounded-xl bg-neutral-2/80 border border-orange-500/25 shadow-[0_0_14px_rgba(255,102,0,0.2)]">
            <TabsTrigger value="files" className="flex items-center gap-2">
              <span className="text-sm">📁 Файлы</span>
            </TabsTrigger>
            <TabsTrigger value="editor" className="flex items-center gap-2">
              <span className="text-sm">📝 Редактор</span>
              {tabs.some(tab => tab.isDirty) && (
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger value="terminal" className="flex items-center gap-2">
              <span className="text-sm">💻 Терминал</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="files" className="flex-1 p-0 m-0">
          <div className="h-full rounded-2xl bg-neutral-1/75 shadow-[0_0_20px_rgba(255,102,0,0.16)]">
            <FileManager
              files={files}
              onFileSelect={handleFileSelect}
              className="h-full border-0 rounded-none"
            />
          </div>
        </TabsContent>

        <TabsContent value="editor" className="flex-1 p-0 m-0">
          <div className="h-full rounded-2xl bg-neutral-1/75 shadow-[0_0_20px_rgba(255,102,0,0.16)]">
            <MonacoEditor />
          </div>
        </TabsContent>

        <TabsContent value="terminal" className="flex-1 p-0 m-0">
          <div className="h-full rounded-2xl bg-neutral-1/75 shadow-[0_0_20px_rgba(255,102,0,0.16)]">
            <Terminal />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
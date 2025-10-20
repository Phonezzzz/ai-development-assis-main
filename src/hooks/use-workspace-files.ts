import { useEffect, useState, useRef } from 'react';
import useSWR from 'swr';
import { useEditorTabsStore } from '@/stores/editor-tabs-store';
import {
  getWorkspaceFileTree,
  getWorkspaceFile,
  putWorkspaceFile,
  subscribeToFileUpdates,
} from '@/lib/services/workspace-api';
import type { WorkspaceFileTree, WorkspaceFileData, WorkspaceFileTreeEvent } from '@/types/workspace';

export function useWorkspaceFiles() {
  const [fileTree, setFileTree] = useState<WorkspaceFileTree>([]);
  const isSubscribedRef = useRef(false);
  
  const { openTab, updateContent, markSaved, setActiveTab, getActiveTab } = useEditorTabsStore();

  // Fetch file tree
  const {
    data: fetchedFileTree,
    error,
    isLoading,
    mutate: refreshFileTree,
  } = useSWR('/api/workspace/files/tree', getWorkspaceFileTree, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  // Update local state when file tree is fetched
  useEffect(() => {
    if (fetchedFileTree) {
      setFileTree(fetchedFileTree);
    }
  }, [fetchedFileTree]);

  // Subscribe to file updates via WebSocket
  useEffect(() => {
    if (isSubscribedRef.current) return;

    const unsubscribe = subscribeToFileUpdates((event: { type: string; [key: string]: unknown }) => {
      console.log('File update event:', JSON.stringify(event as { type: string; [key: string]: unknown }, null, 2));
      
      // Проверяем тип события
      if ((event as { type: string; [key: string]: unknown }).type === 'created' || 
          (event as { type: string; [key: string]: unknown }).type === 'updated' || 
          (event as { type: string; [key: string]: unknown }).type === 'deleted' || 
          (event as { type: string; [key: string]: unknown }).type === 'refresh') {
        // Refresh file tree when files change
        refreshFileTree();
      }
    });

    isSubscribedRef.current = true;

    return () => {
      unsubscribe();
      isSubscribedRef.current = false;
    };
  }, [refreshFileTree]);

  const openFile = async (filePath: string) => {
    try {
      // Check if file is already open in a tab using store state
      const { tabs } = useEditorTabsStore.getState();
      const existingTab = tabs.find(tab => tab.filePath === filePath);
      
      if (existingTab) {
        // File already open, just activate the tab
        setActiveTab(existingTab.id);
        return existingTab;
      }

      // Fetch file content
      const fileData = await getWorkspaceFile(filePath);
      
      // Determine language from file extension
      const language = getLanguageFromExtension(filePath);
      
      // Open new tab
      const tab = {
        filePath,
        content: fileData.content,
        language,
        lastSaved: new Date().toISOString(),
      };
      
      openTab(tab);
      return tab;
    } catch (error) {
      console.error('Failed to open file:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  const saveFile = async (filePath: string, content: string) => {
    try {
      await putWorkspaceFile(filePath, content);
      
      // Update tab state to mark as saved
      const { tabs } = useEditorTabsStore.getState();
      const tab = tabs.find(t => t.filePath === filePath);
      if (tab) {
        markSaved(tab.id);
      }
      
      // Refresh file tree to reflect changes
      await refreshFileTree();
    } catch (error) {
      console.error('Failed to save file:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  const refreshFiles = async () => {
    await refreshFileTree();
  };

  // Helper function to determine language from file extension
  const getLanguageFromExtension = (filePath: string): string => {
    const parts = filePath.split('.');
    const extension = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'html': 'html',
      'xml': 'xml',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
      'dockerfile': 'dockerfile',
      'gitignore': 'gitignore',
    };
    
    return languageMap[extension || ''] || 'plaintext';
  };

  return {
    fileTree,
    isLoading,
    error,
    openFile,
    saveFile,
    refreshFiles,
  };
}
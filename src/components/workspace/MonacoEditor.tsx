import { useEffect, useRef } from 'react';
import { useEditorTabsStore } from '@/stores/editor-tabs-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Circle, FloppyDisk } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useWorkspaceFiles } from '@/hooks/use-workspace-files';

// Типы для Monaco Editor
interface MonacoEditorInstance {
  getValue(): string;
  setValue(value: string): void;
  dispose(): void;
  layout(): void;
  onDidChangeModelContent(listener: () => void): { dispose: () => void };
  getModel(): MonacoModel | null;
  addCommand(keybinding: number, handler: () => void): void;
}

interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
  setLanguage(language: string): void;
}

interface MonacoInstance {
  editor: {
    create: (container: HTMLElement, options: MonacoEditorOptions) => MonacoEditorInstance;
    defineTheme: (name: string, theme: MonacoTheme) => void;
    setTheme: (name: string) => void;
    setModelLanguage: (model: MonacoModel | null, language: string) => void;
    KeyMod: {
      CtrlCmd: number;
    };
    KeyCode: {
      KeyS: number;
    };
  };
  languages: {
    register: (language: { id: string }) => void;
    setMonarchTokensProvider: (languageId: string, provider: unknown) => void;
  };
}

interface MonacoEditorOptions {
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

interface MonacoTheme {
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

// Monaco Editor будет загружаться динамически для оптимизации
let monacoModule: MonacoInstance | null = null;

export function MonacoEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);
  const editorInstanceRef = useRef<MonacoEditorInstance | null>(null);
  
  const { tabs, activeTabId, closeTab, setActiveTab, updateContent, markSaved } = useEditorTabsStore();
  const { saveFile } = useWorkspaceFiles();

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Загрузка Monaco Editor
  useEffect(() => {
    if (!editorRef.current || !activeTab) return;

    const loadMonaco = async () => {
      try {
        if (!monacoModule) {
          // Динамический импорт monaco-editor
          const monaco = await import('monaco-editor');
          monacoModule = monaco as unknown as MonacoInstance;
        }

        // Инициализация Monaco Editor
        if (monacoModule && editorRef.current) {
          const editor = monacoModule.editor.create(editorRef.current, {
            value: activeTab.content,
            language: activeTab.language || 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          });

          editorInstanceRef.current = editor;
          monacoRef.current = monacoModule;

          // Обработчик изменений содержимого
          editor.onDidChangeModelContent(() => {
            const content = editor.getValue();
            updateContent(activeTab.id, content);
          });

          // Сохранение по Ctrl+S
          editor.addCommand(
            monacoModule.editor.KeyMod.CtrlCmd | monacoModule.editor.KeyCode.KeyS,
            () => {
              handleSave(activeTab.filePath, editor.getValue());
            }
          );
        }
      } catch (error) {
        console.error('Failed to load Monaco Editor:', JSON.stringify(error, null, 2));
      }
    };

    loadMonaco();

    return () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.dispose();
        editorInstanceRef.current = null;
      }
    };
  }, [activeTab && activeTab.id]);

  // Обновление содержимого при смене активной вкладки
  useEffect(() => {
    if (editorInstanceRef.current && activeTab && monacoRef.current) {
      const editor = editorInstanceRef.current;
      const model = editor.getModel();
      
      if (model && model.getValue() !== activeTab.content) {
        editor.setValue(activeTab.content);
      }
      
      if (activeTab.language && monacoRef.current.editor) {
        monacoRef.current.editor.setModelLanguage(model, activeTab.language);
      }
    }
  }, [activeTab && activeTab.id, activeTab && activeTab.content, activeTab && activeTab.language]);

  const handleSave = async (filePath: string, content: string) => {
    try {
      await saveFile(filePath, content);
      markSaved(activeTabId!);
    } catch (error) {
      console.error('Failed to save file:', JSON.stringify(error, null, 2));
    }
  };

  const handleCloseTab = (tabId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    closeTab(tabId);
  };

  if (tabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        <div className="text-center">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-medium mb-2">Редактор</h3>
          <p className="text-sm">Откройте файл для редактирования</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Вкладки редактора */}
      <div className="flex bg-muted border-b">
        <ScrollArea className="flex-1">
          <div className="flex min-w-max">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer text-sm transition-colors",
                  activeTabId === tab.id
                    ? "bg-background text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="truncate max-w-32">{tab.filePath.split('/').pop()}</span>
                {tab.isDirty && (
                  <Circle size={8} className="text-yellow-500 fill-current" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                >
                  <X size={12} />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {activeTab && activeTab.isDirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 mr-2 my-1"
            onClick={() => handleSave(activeTab.filePath, activeTab.content)}
          >
            <FloppyDisk size={14} className="mr-1" />
            Сохранить
          </Button>
        )}
      </div>

      {/* Редактор */}
      <div ref={editorRef} className="flex-1" />
    </div>
  );
}
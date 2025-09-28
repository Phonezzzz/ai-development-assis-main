import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useKV } from '@/shims/spark-hooks';
import { cn } from '@/lib/utils';
import { 
  Robot,
  Plus,
  Wrench,
  BugBeetle,
  Code,
  Gear
} from '@phosphor-icons/react';
import { toast } from 'sonner';

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  createdAt: Date;
}

const DEFAULT_AGENTS = [
  { 
    id: 'architector', 
    name: 'Архитектор', 
    icon: '🏗️', 
    description: 'Проектирует архитектуру системы',
    prompt: 'Ты архитектор системы. Создавай детальные архитектурные решения и планы.'
  },
  { 
    id: 'fixer', 
    name: 'Исправляющий', 
    icon: '🔧', 
    description: 'Исправляет ошибки и баги',
    prompt: 'Ты специалист по исправлению ошибок. Находи и исправляй баги в коде.'
  },
  { 
    id: 'coder', 
    name: 'Кодер', 
    icon: '💻', 
    description: 'Пишет качественный код',
    prompt: 'Ты опытный разработчик. Пиши чистый, эффективный и хорошо документированный код.'
  },
  { 
    id: 'analyzer', 
    name: 'Аналитик', 
    icon: '📊', 
    description: 'Анализирует код и данные',
    prompt: 'Ты специалист по анализу кода и данных. Проводи глубокий анализ и предоставляй детальные отчеты.'
  },
  { 
    id: 'reviewer', 
    name: 'Ревьюер', 
    icon: '👁️', 
    description: 'Проверяет качество кода',
    prompt: 'Ты эксперт по ревью кода. Проверяй код на качество, безопасность и соответствие стандартам.'
  },
  { 
    id: 'documenter', 
    name: 'Документатор', 
    icon: '📚', 
    description: 'Создает документацию',
    prompt: 'Ты специалист по созданию документации. Создавай понятную и подробную документацию для кода и проектов.'
  },
  { 
    id: 'tester', 
    name: 'Тестировщик', 
    icon: '🧪', 
    description: 'Создает тесты',
    prompt: 'Ты эксперт по тестированию. Создавай comprehensive тесты для обеспечения качества кода.'
  },
];

interface AgentSelectorProps {
  selectedAgent?: string;
  onAgentSelect: (agentId: string) => void;
  className?: string;
}

export function AgentSelector({ selectedAgent, onAgentSelect, className }: AgentSelectorProps) {
  const [customAgents, setCustomAgents] = useKV<CustomAgent[]>('custom-agents', []);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDescription, setNewAgentDescription] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');
  const [newAgentIcon, setNewAgentIcon] = useState('🤖');

  const allAgents = [...DEFAULT_AGENTS, ...(customAgents || [])];
  const currentAgent = allAgents.find(agent => agent.id === selectedAgent);

  const handleAddAgent = () => {
    if (!newAgentName.trim() || !newAgentPrompt.trim()) {
      toast.error('Заполните название и промпт агента');
      return;
    }

    const newAgent: CustomAgent = {
      id: `custom_${Date.now()}`,
      name: newAgentName.trim(),
      description: newAgentDescription.trim() || 'Пользовательский агент',
      prompt: newAgentPrompt.trim(),
      icon: newAgentIcon || '🤖',
      createdAt: new Date(),
    };

    setCustomAgents(prev => [...(prev || []), newAgent]);
    onAgentSelect(newAgent.id);
    
    // Reset form
    setNewAgentName('');
    setNewAgentDescription('');
    setNewAgentPrompt('');
    setNewAgentIcon('🤖');
    setIsAddDialogOpen(false);

    toast.success(`Агент "${newAgent.name}" создан успешно`);
  };

  const handleDeleteAgent = (agentId: string) => {
    setCustomAgents(prev => (prev || []).filter(agent => agent.id !== agentId));
    if (selectedAgent === agentId) {
      onAgentSelect(DEFAULT_AGENTS[0].id);
    }
    toast.success('Агент удален');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn(
              "h-6 w-6 p-0 bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]",
              className
            )}
            title={`Агент: ${currentAgent?.name || 'Не выбран'}`}
          >
            <Robot size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {/* Default agents */}
          {DEFAULT_AGENTS.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => onAgentSelect(agent.id)}
              className={cn(
                "flex items-start gap-3 p-3 cursor-pointer",
                selectedAgent === agent.id && "bg-accent"
              )}
            >
              <div className="text-lg">{agent.icon}</div>
              <div className="flex-1">
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.description}</div>
              </div>
              {selectedAgent === agent.id && (
                <div className="w-2 h-2 bg-accent rounded-full" />
              )}
            </DropdownMenuItem>
          ))}

          {/* Custom agents */}
          {customAgents && customAgents.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {customAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => onAgentSelect(agent.id)}
                  className={cn(
                    "flex items-start gap-3 p-3 cursor-pointer group",
                    selectedAgent === agent.id && "bg-accent"
                  )}
                >
                  <div className="text-lg">{agent.icon}</div>
                  <div className="flex-1">
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedAgent === agent.id && (
                      <div className="w-2 h-2 bg-accent rounded-full" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAgent(agent.id);
                      }}
                      title="Удалить агента"
                    >
                      ×
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          
          {/* Add new agent */}
          <DropdownMenuItem
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-3 p-3 cursor-pointer text-accent hover:text-accent-foreground hover:bg-accent"
          >
            <Plus size={16} />
            <span className="font-medium">Добавить агента</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add agent dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Создать нового агента</DialogTitle>
            <DialogDescription>
              Создайте персонального ИИ агента с уникальными инструкциями и поведением.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="agent-icon" className="text-right">
                Иконка
              </Label>
              <Input
                id="agent-icon"
                value={newAgentIcon}
                onChange={(e) => setNewAgentIcon(e.target.value)}
                placeholder="🤖"
                className="col-span-3"
                maxLength={2}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="agent-name" className="text-right">
                Название
              </Label>
              <Input
                id="agent-name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Мой агент"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="agent-description" className="text-right">
                Описание
              </Label>
              <Input
                id="agent-description"
                value={newAgentDescription}
                onChange={(e) => setNewAgentDescription(e.target.value)}
                placeholder="Краткое описание агента"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="agent-prompt" className="text-right pt-2">
                Промпт
              </Label>
              <Textarea
                id="agent-prompt"
                value={newAgentPrompt}
                onChange={(e) => setNewAgentPrompt(e.target.value)}
                placeholder="Опишите инструкции для агента. Например: 'Ты специалист по тестированию. Создавай comprehensive тесты для кода...'"
                className="col-span-3 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddAgent}>
              Создать агента
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
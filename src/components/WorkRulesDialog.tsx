import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { WorkRule } from '@/lib/types';
import { useWorkRules } from '@/hooks/use-work-rules';
import { cn } from '@/lib/utils';
import {
  Plus,
  Gear as Settings,
  Trash,
  PencilSimple as Edit,
  Flag,
  Code,
  TestTube,
  Rocket,
  Book,
  Gear,
  CheckCircle,
  DotsThreeVertical
} from '@phosphor-icons/react';
import { toast } from 'sonner';

export function WorkRulesDialog() {
  const {
    currentRulesSet,
    getActiveRules,
    addWorkRule,
    updateWorkRule,
    deleteWorkRule,
    getRulesCount,
    initializeDefaultRules
  } = useWorkRules();

  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<WorkRule['category']>('general');
  const [newRulePriority, setNewRulePriority] = useState<WorkRule['priority']>('medium');

  const activeRules = getActiveRules();
  const rulesCount = getRulesCount();

  const handleAddRule = () => {
    if (!newRuleTitle.trim()) {
      toast.error('Введите название правила');
      return;
    }

    addWorkRule(newRuleTitle, newRuleDescription, newRuleCategory, newRulePriority);
    setNewRuleTitle('');
    setNewRuleDescription('');
    setNewRuleCategory('general');
    setNewRulePriority('medium');
    setShowAddForm(false);
  };

  const getCategoryIcon = (category: WorkRule['category']) => {
    switch (category) {
      case 'coding': return <Code size={16} />;
      case 'testing': return <TestTube size={16} />;
      case 'deployment': return <Rocket size={16} />;
      case 'documentation': return <Book size={16} />;
      default: return <Gear size={16} />;
    }
  };

  const getCategoryColor = (category: WorkRule['category']) => {
    switch (category) {
      case 'coding': return 'bg-blue-500/20 text-blue-300';
      case 'testing': return 'bg-green-500/20 text-green-300';
      case 'deployment': return 'bg-purple-500/20 text-purple-300';
      case 'documentation': return 'bg-yellow-500/20 text-yellow-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  const getPriorityColor = (priority: WorkRule['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="gap-2 bg-orange-600 text-black hover:bg-orange-500 shadow-[0_0_15px_rgba(255,102,0,0.45)]"
          title={`Work Rules (${rulesCount} активных)`}
          onClick={() => {
            if (!currentRulesSet) {
              initializeDefaultRules();
            }
          }}
        >
          <Settings size={16} />
          Rules
          {rulesCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {rulesCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-neutral-1 border border-orange-500/30 text-neutral-12 shadow-[0_0_35px_rgba(255,102,0,0.25)] backdrop-blur">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={20} />
            Work Rules
            {currentRulesSet && (
              <Badge variant="outline">
                {currentRulesSet.name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Настройте правила работы для агентов. Эти правила будут автоматически добавлены к контексту при планировании и выполнении задач.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Stats */}
          {currentRulesSet && (
            <div className="flex items-center gap-4 p-3 rounded-lg border border-orange-500/25 bg-neutral-2/90 shadow-[0_0_18px_rgba(255,102,0,0.18)]">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm">
                  <strong>{rulesCount}</strong> активных правил
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Последнее обновление: {new Date(currentRulesSet.updatedAt).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Rules List */}
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {activeRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Нет активных правил</p>
                  <p className="text-xs">Добавьте первое правило работы</p>
                </div>
              ) : (
                activeRules.map(rule => (
                  <Card key={rule.id} className="p-4 bg-neutral-2/90 border border-orange-500/25 shadow-[0_0_20px_rgba(255,102,0,0.22)]">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs",
                            getCategoryColor(rule.category)
                          )}>
                            {getCategoryIcon(rule.category)}
                            {rule.category}
                          </div>
                          <Flag size={14} className={getPriorityColor(rule.priority)} />
                          <h4 className="font-medium">{rule.title}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {rule.description}
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.isActive}
                              onCheckedChange={(checked) =>
                                updateWorkRule(rule.id, { isActive: checked })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {rule.isActive ? 'Активно' : 'Отключено'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-orange-200 hover:bg-orange-500/15">
                            <DotsThreeVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => deleteWorkRule(rule.id)}
                            className="text-red-500"
                          >
                            <Trash size={14} className="mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Add Rule Form */}
          {showAddForm ? (
            <Card className="p-4 bg-neutral-2/95 border border-orange-500/25 shadow-[0_0_20px_rgba(255,102,0,0.24)]">
              <h4 className="font-medium mb-3">Добавить новое правило</h4>
              <div className="space-y-3">
                <Input
                  value={newRuleTitle}
                  onChange={(e) => setNewRuleTitle(e.target.value)}
                  placeholder="Название правила..."
                />
                <Textarea
                  value={newRuleDescription}
                  onChange={(e) => setNewRuleDescription(e.target.value)}
                  placeholder="Описание правила..."
                  className="h-20 resize-none"
                />
                <div className="flex gap-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2 border border-orange-500/40 bg-neutral-2 hover:bg-orange-500/10 text-orange-200">
                        {getCategoryIcon(newRuleCategory)}
                        {newRuleCategory}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setNewRuleCategory('coding')}>
                        <Code size={14} className="mr-2" />
                        Программирование
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRuleCategory('testing')}>
                        <TestTube size={14} className="mr-2" />
                        Тестирование
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRuleCategory('deployment')}>
                        <Rocket size={14} className="mr-2" />
                        Развертывание
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRuleCategory('documentation')}>
                        <Book size={14} className="mr-2" />
                        Документация
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRuleCategory('general')}>
                        <Gear size={14} className="mr-2" />
                        Общие
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2 border border-orange-500/40 bg-neutral-2 hover:bg-orange-500/10 text-orange-200">
                        <Flag size={14} className={getPriorityColor(newRulePriority)} />
                        {newRulePriority === 'high' ? 'Высокий' :
                         newRulePriority === 'medium' ? 'Средний' : 'Низкий'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setNewRulePriority('high')}>
                        <Flag size={14} className="mr-2 text-red-500" />
                        Высокий
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRulePriority('medium')}>
                        <Flag size={14} className="mr-2 text-yellow-500" />
                        Средний
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNewRulePriority('low')}>
                        <Flag size={14} className="mr-2 text-green-500" />
                        Низкий
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddRule} className="flex-1 bg-orange-600 text-black hover:bg-orange-500 shadow-[0_0_15px_rgba(255,102,0,0.4)]">
                    Добавить правило
                  </Button>
                  <Button
                    onClick={() => setShowAddForm(false)}
                    variant="outline"
                    className="border border-orange-500/40 bg-neutral-2 text-orange-200 hover:bg-orange-500/10"
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Button
              onClick={() => setShowAddForm(true)}
              variant="default"
              className="gap-2 bg-orange-600 text-black hover:bg-orange-500 shadow-[0_0_15px_rgba(255,102,0,0.4)]"
            >
              <Plus size={16} />
              Добавить правило
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
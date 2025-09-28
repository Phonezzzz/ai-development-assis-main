import { useState, useCallback } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { WorkRule, WorkRulesSet } from '@/lib/types';
import { toast } from 'sonner';

const DEFAULT_WORK_RULES: WorkRule[] = [
  {
    id: 'rule_typescript_strict',
    title: 'Используй строгий TypeScript',
    description: 'Всегда указывай типы, избегай any, используй строгие проверки',
    category: 'coding',
    priority: 'high',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'rule_no_console_log',
    title: 'Не оставляй console.log в продакшене',
    description: 'Убирай отладочные console.log перед коммитом',
    category: 'coding',
    priority: 'medium',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'rule_test_coverage',
    title: 'Пиши тесты для новых функций',
    description: 'Каждая новая функция должна иметь базовые тесты',
    category: 'testing',
    priority: 'high',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'rule_commit_messages',
    title: 'Используй понятные commit сообщения',
    description: 'Формат: "type: краткое описание изменения"',
    category: 'general',
    priority: 'medium',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'rule_component_structure',
    title: 'Следуй структуре компонентов',
    description: 'Импорты → типы → компонент → экспорт. Используй существующие UI компоненты.',
    category: 'coding',
    priority: 'high',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export function useWorkRules() {
  const [workRulesSets, setWorkRulesSets] = useKV<WorkRulesSet[]>('work-rules-sets', []);
  const [currentRulesSet, setCurrentRulesSet] = useKV<WorkRulesSet | null>('current-work-rules', null);

  // Initialize default rules if none exist
  const initializeDefaultRules = useCallback(async () => {
    if (!currentRulesSet && (!workRulesSets || workRulesSets.length === 0)) {
      const defaultSet: WorkRulesSet = {
        id: 'default_rules',
        name: 'Правила по умолчанию',
        description: 'Базовые правила разработки',
        rules: DEFAULT_WORK_RULES,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setWorkRulesSets([defaultSet]);
      setCurrentRulesSet(defaultSet);
      toast.success('Инициализированы правила работы по умолчанию');
    }
  }, [currentRulesSet, workRulesSets, setWorkRulesSets, setCurrentRulesSet]);

  const createWorkRulesSet = useCallback(async (name: string, description?: string) => {
    const newSet: WorkRulesSet = {
      id: `rules_set_${Date.now()}`,
      name,
      description,
      rules: [],
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setWorkRulesSets(prev => [...(prev || []), newSet]);
    toast.success(`Создан набор правил: ${name}`);
    return newSet;
  }, [setWorkRulesSets]);

  const addWorkRule = useCallback((
    title: string,
    description: string,
    category: WorkRule['category'] = 'general',
    priority: WorkRule['priority'] = 'medium'
  ) => {
    if (!currentRulesSet) {
      toast.error('Нет активного набора правил');
      return;
    }

    const newRule: WorkRule = {
      id: `rule_${Date.now()}`,
      title,
      description,
      category,
      priority,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedSet = {
      ...currentRulesSet,
      rules: [...currentRulesSet.rules, newRule],
      updatedAt: new Date(),
    };

    setCurrentRulesSet(updatedSet);
    setWorkRulesSets(prev =>
      (prev || []).map(set =>
        set.id === currentRulesSet.id ? updatedSet : set
      )
    );

    toast.success(`Добавлено правило: ${title}`);
    return newRule;
  }, [currentRulesSet, setCurrentRulesSet, setWorkRulesSets]);

  const updateWorkRule = useCallback((ruleId: string, updates: Partial<WorkRule>) => {
    if (!currentRulesSet) return;

    const updatedRules = currentRulesSet.rules.map(rule =>
      rule.id === ruleId ? { ...rule, ...updates, updatedAt: new Date() } : rule
    );

    const updatedSet = {
      ...currentRulesSet,
      rules: updatedRules,
      updatedAt: new Date(),
    };

    setCurrentRulesSet(updatedSet);
    setWorkRulesSets(prev =>
      (prev || []).map(set =>
        set.id === currentRulesSet.id ? updatedSet : set
      )
    );

    toast.success('Правило обновлено');
  }, [currentRulesSet, setCurrentRulesSet, setWorkRulesSets]);

  const deleteWorkRule = useCallback((ruleId: string) => {
    if (!currentRulesSet) return;

    const updatedRules = currentRulesSet.rules.filter(rule => rule.id !== ruleId);
    const updatedSet = {
      ...currentRulesSet,
      rules: updatedRules,
      updatedAt: new Date(),
    };

    setCurrentRulesSet(updatedSet);
    setWorkRulesSets(prev =>
      (prev || []).map(set =>
        set.id === currentRulesSet.id ? updatedSet : set
      )
    );

    toast.success('Правило удалено');
  }, [currentRulesSet, setCurrentRulesSet, setWorkRulesSets]);

  const getActiveRules = useCallback(() => {
    if (!currentRulesSet) return [];
    return currentRulesSet.rules.filter(rule => rule.isActive);
  }, [currentRulesSet]);

  const getActiveRulesByCategory = useCallback((category: WorkRule['category']) => {
    return getActiveRules().filter(rule => rule.category === category);
  }, [getActiveRules]);

  const formatRulesForPrompt = useCallback(() => {
    const activeRules = getActiveRules();
    if (activeRules.length === 0) return '';

    const rulesByCategory = activeRules.reduce((acc, rule) => {
      if (!acc[rule.category]) acc[rule.category] = [];
      acc[rule.category].push(rule);
      return acc;
    }, {} as Record<string, WorkRule[]>);

    let formatted = '\n## 📋 ПРАВИЛА РАБОТЫ:\n\n';

    Object.entries(rulesByCategory).forEach(([category, rules]) => {
      const categoryNames = {
        coding: '💻 Программирование',
        testing: '🧪 Тестирование',
        deployment: '🚀 Развертывание',
        documentation: '📚 Документация',
        general: '⚙️ Общие правила'
      };

      formatted += `### ${categoryNames[category as WorkRule['category']] || category}:\n`;
      rules.forEach(rule => {
        const priorityIcon = rule.priority === 'high' ? '🔴' : rule.priority === 'medium' ? '🟡' : '🟢';
        formatted += `${priorityIcon} **${rule.title}**: ${rule.description}\n`;
      });
      formatted += '\n';
    });

    return formatted;
  }, [getActiveRules]);

  const getRulesCount = useCallback(() => {
    return getActiveRules().length;
  }, [getActiveRules]);

  return {
    // State
    workRulesSets,
    currentRulesSet,

    // Actions
    initializeDefaultRules,
    createWorkRulesSet,
    addWorkRule,
    updateWorkRule,
    deleteWorkRule,
    setCurrentRulesSet,

    // Getters
    getActiveRules,
    getActiveRulesByCategory,
    formatRulesForPrompt,
    getRulesCount,
  };
}
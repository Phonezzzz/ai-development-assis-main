import { useState, useCallback } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { TodoList, TodoItem, TodoContext, WorkspaceMode } from '@/lib/types';
import { vectorService } from '@/lib/services/vector';
import { toast } from 'sonner';

export function useTodo() {
  const [currentList, setCurrentList] = useKV<TodoList | null>('current-todo-list', null);
  const [todoLists, setTodoLists] = useKV<TodoList[]>('todo-lists', []);
  const [todoContext, setTodoContext] = useKV<TodoContext>('todo-context', {});

  const createTodoList = useCallback(async (name: string, description?: string) => {
    const newList: TodoList = {
      id: `todo_list_${Date.now()}`,
      name,
      description,
      items: [],
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalEstimatedTime: 0,
      totalActualTime: 0,
    };

    setCurrentList(newList);
    setTodoLists(prev => [...(prev || []), newList]);

    // Store in vector database for future reference
    try {
      await vectorService.addDocument({
        id: newList.id,
        content: `TODO List: ${name}\nDescription: ${description || 'No description'}`,
        metadata: {
          type: 'todo_list',
          listId: newList.id,
          name,
          status: newList.status,
          createdAt: newList.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Error storing todo list in vector DB:', JSON.stringify(error, null, 2));
    }

    toast.success(`Создан TODO список: ${name}`);
    return newList;
  }, [setCurrentList, setTodoLists]);

  const addTodoItem = useCallback(async (
    title: string,
    options: {
      description?: string;
      instructions?: string;
      expectedResult?: string;
      priority?: 'low' | 'medium' | 'high';
      workspaceMode?: WorkspaceMode;
      estimatedTime?: number;
      dependencies?: string[];
      tags?: string[];
    } = {}
  ) => {
    if (!currentList) {
      toast.error('Нет активного TODO списка');
      return;
    }

    const newItem: TodoItem = {
      id: `todo_${Date.now()}`,
      title,
      description: options.description,
      instructions: options.instructions,
      expectedResult: options.expectedResult,
      status: 'pending',
      priority: options.priority || 'medium',
      workspaceMode: options.workspaceMode || 'act',
      createdAt: new Date(),
      updatedAt: new Date(),
      dependencies: options.dependencies,
      estimatedTime: options.estimatedTime,
      tags: options.tags,
    };

    const updatedList = {
      ...currentList,
      items: [...currentList.items, newItem],
      updatedAt: new Date(),
      totalEstimatedTime: (currentList.totalEstimatedTime || 0) + (options.estimatedTime || 0),
    };

    setCurrentList(updatedList);
    setTodoLists(prev =>
      (prev || []).map(list =>
        list.id === currentList.id ? updatedList : list
      )
    );

    // Store in vector database
    try {
      await vectorService.addDocument({
        id: newItem.id,
        content: `TODO: ${title}\nDescription: ${options.description || ''}\nInstructions: ${options.instructions || ''}`,
        metadata: {
          type: 'todo_item',
          itemId: newItem.id,
          listId: currentList.id,
          title,
          status: newItem.status,
          priority: newItem.priority,
          workspaceMode: newItem.workspaceMode,
          createdAt: newItem.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Error storing todo item in vector DB:', JSON.stringify(error, null, 2));
    }

    toast.success(`Добавлена задача: ${title}`);
    return newItem;
  }, [currentList, setCurrentList, setTodoLists]);

  const updateTodoItem = useCallback(async (
    itemId: string,
    updates: Partial<TodoItem>
  ) => {
    if (!currentList) return;

    const itemIndex = currentList.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      toast.error('Задача не найдена');
      return;
    }

    const updatedItem = {
      ...currentList.items[itemIndex],
      ...updates,
      updatedAt: new Date(),
      ...(updates.status === 'completed' && !currentList.items[itemIndex].completedAt && {
        completedAt: new Date()
      })
    };

    const updatedItems = [...currentList.items];
    updatedItems[itemIndex] = updatedItem;

    // Calculate actual time if completing
    let totalActualTime = currentList.totalActualTime;
    if (updates.status === 'completed' && updatedItem.actualTime) {
      const timeDiff = updatedItem.actualTime - (currentList.items[itemIndex].actualTime || 0);
      totalActualTime = (currentList.totalActualTime || 0) + timeDiff;
    }

    const updatedList = {
      ...currentList,
      items: updatedItems,
      updatedAt: new Date(),
      ...(totalActualTime && { totalActualTime })
    };

    setCurrentList(updatedList);
    setTodoLists(prev =>
      (prev || []).map(list =>
        list.id === currentList.id ? updatedList : list
      )
    );

    // Update in vector database
    try {
      await vectorService.addDocument({
        id: `${itemId}_update_${Date.now()}`,
        content: `TODO Update: ${updatedItem.title}\nStatus: ${updatedItem.status}\nResult: ${updatedItem.result || 'No result'}`,
        metadata: {
          type: 'todo_update',
          itemId: updatedItem.id,
          listId: currentList.id,
          status: updatedItem.status,
          updatedAt: updatedItem.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Error updating todo item in vector DB:', JSON.stringify(error, null, 2));
    }

    const statusMessages = {
      'pending': 'Задача возвращена в ожидание',
      'in_progress': 'Задача выполняется',
      'completed': 'Задача выполнена',
      'failed': 'Задача провалена'
    };

    toast.success(statusMessages[updatedItem.status] || 'Задача обновлена');
    return updatedItem;
  }, [currentList, setCurrentList, setTodoLists]);

  const deleteTodoItem = useCallback((itemId: string) => {
    if (!currentList) return;

    const updatedItems = currentList.items.filter(item => item.id !== itemId);
    const updatedList = {
      ...currentList,
      items: updatedItems,
      updatedAt: new Date(),
    };

    setCurrentList(updatedList);
    setTodoLists(prev =>
      (prev || []).map(list =>
        list.id === currentList.id ? updatedList : list
      )
    );

    toast.success('Задача удалена');
  }, [currentList, setCurrentList, setTodoLists]);

  const setCurrentTodoInProgress = useCallback(async (itemId: string) => {
    // Set current item to in_progress and others to pending if they were in_progress
    if (!currentList) return;

    const updatedItems = currentList.items.map(item => ({
      ...item,
      status: item.id === itemId ? 'in_progress' as const :
              item.status === 'in_progress' ? 'pending' as const :
              item.status,
      updatedAt: item.id === itemId || item.status === 'in_progress' ? new Date() : item.updatedAt
    }));

    const updatedList = {
      ...currentList,
      items: updatedItems,
      updatedAt: new Date(),
    };

    setCurrentList(updatedList);
    setTodoLists(prev =>
      (prev || []).map(list =>
        list.id === currentList.id ? updatedList : list
      )
    );

    const currentItem = updatedItems.find(item => item.id === itemId);
    if (currentItem) {
      toast.info(`Начинаю работу над: ${currentItem.title}`);
    }
  }, [currentList, setCurrentList, setTodoLists]);

  const updateContext = useCallback((newContext: Partial<TodoContext>) => {
    setTodoContext(prev => ({ ...prev, ...newContext }));
  }, [setTodoContext]);

  const getCurrentItem = useCallback(() => {
    if (!currentList) return null;
    return currentList.items.find(item => item.status === 'in_progress') || null;
  }, [currentList]);

  const getNextItem = useCallback(() => {
    if (!currentList) return null;
    return currentList.items.find(item => item.status === 'pending') || null;
  }, [currentList]);

  const getCompletedCount = useCallback(() => {
    if (!currentList) return 0;
    return currentList.items.filter(item => item.status === 'completed').length;
  }, [currentList]);

  const getTotalCount = useCallback(() => {
    if (!currentList) return 0;
    return currentList.items.length;
  }, [currentList]);

  const getProgress = useCallback(() => {
    const total = getTotalCount();
    const completed = getCompletedCount();
    return total > 0 ? (completed / total) * 100 : 0;
  }, [getTotalCount, getCompletedCount]);

  return {
    // State
    currentList,
    todoLists,
    todoContext,

    // Actions
    createTodoList,
    addTodoItem,
    updateTodoItem,
    deleteTodoItem,
    setCurrentTodoInProgress,
    updateContext,

    // Getters
    getCurrentItem,
    getNextItem,
    getCompletedCount,
    getTotalCount,
    getProgress,

    // Setters
    setCurrentList,
  };
}
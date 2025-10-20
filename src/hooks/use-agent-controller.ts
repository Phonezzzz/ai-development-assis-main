import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentTask, PendingPlan } from '@/lib/types';
import {
  agentController,
  type AgentControllerSnapshot,
  type ConfirmPlanOptions,
  type EnqueueTaskOptions,
  type UpdateTaskOptions,
} from '@/lib/services/agent-controller';

interface UseAgentControllerOptions {
  sessionId?: string;
  name?: string;
  description?: string;
  autoInitialize?: boolean;
}

type InitializeParams = {
  id?: string;
  name?: string;
  description?: string;
};

export function useAgentController(options: UseAgentControllerOptions = {}) {
  const {
    sessionId = 'default-agent-session',
    name,
    description,
    autoInitialize = true,
  } = options;

  const [snapshot, setSnapshot] = useState<AgentControllerSnapshot | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const initializePromiseRef = useRef<Promise<AgentControllerSnapshot> | null>(null);

  const applySubscription = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = agentController.subscribe((event, nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
  }, []);

  const initialize = useCallback(
    async (params: InitializeParams = {}) => {
      if (!initializePromiseRef.current) {
        initializePromiseRef.current = agentController
          .initialize({
            id: params.id ?? sessionId,
            name: params.name ?? name,
            description: params.description ?? description,
          })
          .then((initialSnapshot) => {
            setSnapshot(initialSnapshot);
            applySubscription();
            return initialSnapshot;
          })
          .catch((error) => {
            initializePromiseRef.current = null;
            throw error;
          });
      }
      return initializePromiseRef.current;
    },
    [sessionId, name, description, applySubscription],
  );

  useEffect(() => {
    if (!autoInitialize) return;
    void initialize();
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      initializePromiseRef.current = null;
    };
  }, [autoInitialize, initialize]);

  const submitPlan = useCallback(
    (plan: PendingPlan) => {
      const nextSnapshot = agentController.submitPlan(plan);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [],
  );

  const confirmPlan = useCallback(
    (options?: ConfirmPlanOptions) => {
      const nextSnapshot = agentController.confirmPlan(options);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [],
  );

  const rejectPlan = useCallback(() => {
    const nextSnapshot = agentController.rejectPlan();
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, []);

  const enqueueTask = useCallback(
    (taskOrTasks: AgentTask | AgentTask[], options?: EnqueueTaskOptions) => {
      const nextSnapshot = agentController.enqueueTask(taskOrTasks, options);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [],
  );

  const updateTask = useCallback(
    (taskId: string, updates: Partial<AgentTask>, options?: UpdateTaskOptions) => {
      const nextSnapshot = agentController.updateTask(taskId, updates, options);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [],
  );

  const clearQueue = useCallback(() => {
    const nextSnapshot = agentController.clearQueue();
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, []);

  const controllerApi = useMemo(
    () => ({
      initialize,
      submitPlan,
      confirmPlan,
      rejectPlan,
      enqueueTask,
      updateTask,
      clearQueue,
      getSnapshot: () => agentController.getSnapshot(),
    }),
    [initialize, submitPlan, confirmPlan, rejectPlan, enqueueTask, updateTask, clearQueue],
  );

  return {
    snapshot,
    controller: controllerApi,
  };
}
import { useEffect } from 'react';
import { ModeOrchestrator } from '@/components/orchestrator/ModeOrchestrator';
import { Toaster } from '@/components/ui/sonner';
import { agentNotificationService } from '@/lib/services/agent-notification-service';

export default function App() {
  useEffect(() => {
    agentNotificationService.initialize();
    return () => {
      agentNotificationService.dispose();
    };
  }, []);

  return (
    <>
      <ModeOrchestrator />
      <Toaster />
    </>
  );
}

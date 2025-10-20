import type { Message } from '@/lib/types';
import type { WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { ChatMode } from '@/components/modes/ChatMode';

interface ChatShellProps {
  messages: Message[];
  isProcessing: boolean;
  onSendMessage: (text: string, mode: WorkspaceModeType, isVoice?: boolean) => Promise<void>;
}

export function ChatShell({
  messages,
  isProcessing,
  onSendMessage,
}: ChatShellProps) {
  return (
    <ChatMode
      messages={messages}
      isProcessing={isProcessing}
      onSendMessage={onSendMessage}
    />
  );
}
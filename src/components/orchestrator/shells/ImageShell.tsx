import { useCallback } from 'react';
import type { Message } from '@/lib/types';
import type { WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { ImageCreatorMode } from '@/components/modes/ImageCreatorMode';
import type { WorkspaceMode } from '@/lib/types';

interface ImageShellProps {
  messages: Message[];
  isProcessing: boolean;
  showGallery: boolean;
  onToggleGallery: () => void;
  onSendMessage: (text: string, mode: WorkspaceModeType, isVoice?: boolean) => Promise<void>;
}

export function ImageShell({
  messages,
  isProcessing,
  showGallery,
  onToggleGallery,
  onSendMessage,
}: ImageShellProps) {
  const handleSendMessage = useCallback(
    (text: string, mode: WorkspaceMode, isVoice?: boolean) =>
      onSendMessage(text, mode as WorkspaceModeType, isVoice),
    [onSendMessage],
  );

  return (
    <ImageCreatorMode
      messages={messages}
      isProcessing={isProcessing}
      showGallery={showGallery}
      onToggleGallery={onToggleGallery}
      onSendMessage={handleSendMessage}
    />
  );
}
import React, { Suspense } from 'react';
import { ChatMode } from '@/components/modes/ChatMode';
import { ImageCreatorMode } from '@/components/modes/ImageCreatorMode';
import { WorkspaceMode } from '@/components/modes/WorkspaceMode';
import { RoutingMonitor } from '@/components/debug/RoutingMonitor';
import { OperatingMode, WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { Message } from '@/lib/types';

interface ModeContentProps {
  currentMode: OperatingMode;
  messages: Message[];
  onSendMessage: (text: string, mode: WorkspaceModeType, isVoice?: boolean) => void;
  isProcessing: boolean;
  showImageGallery: boolean;
  onToggleGallery: () => void;
  showTestSuite: boolean;
  showRoutingMonitor: boolean;
  isDevelopment: boolean;
}

export function ModeContent({
  currentMode,
  messages,
  onSendMessage,
  isProcessing,
  showImageGallery,
  onToggleGallery,
  showTestSuite,
  showRoutingMonitor,
  isDevelopment
}: ModeContentProps) {
  const renderMode = () => {
    switch (currentMode) {
      case 'chat':
        return (
          <ChatMode
            messages={messages || []}
            onSendMessage={onSendMessage}
            isProcessing={isProcessing}
          />
        );
      case 'image-creator':
        return (
          <ImageCreatorMode
            messages={messages}
            onSendMessage={onSendMessage}
            isProcessing={isProcessing}
            showGallery={showImageGallery}
            onToggleGallery={onToggleGallery}
          />
        );
      case 'workspace':
        return (
          <WorkspaceMode
            messages={messages || []}
            onSendMessage={onSendMessage}
            isProcessing={isProcessing}
          />
        );
      default:
        return null;
    }
  };

  if (showRoutingMonitor && isDevelopment) {
    return (
      <div className="h-full">
        <RoutingMonitor />
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Suspense fallback={<div className="flex items-center justify-center h-full text-neutral-11">Загрузка...</div>}>
        {renderMode()}
      </Suspense>
    </div>
  );
}
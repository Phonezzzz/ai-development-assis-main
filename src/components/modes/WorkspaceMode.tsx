import { useEffect } from 'react';
import { useVoice } from '@/hooks/useVoice';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { Message } from '@/lib/types';

interface WorkspaceModeProps {
  messages?: Message[];
  onSendMessage?: (text: string, mode: string, isVoice?: boolean) => void;
  isProcessing?: boolean;
  currentMode?: string;
  onModeChange?: (mode: string) => void;
}

export function WorkspaceMode({ onSendMessage }: WorkspaceModeProps) {
  const { tts } = useVoice();
  const { stop } = tts;

  // Останавливаем TTS при размонтировании контейнера режима
  useEffect(() => {
    return () => {
      console.debug('[WorkspaceMode] cleanup triggered at', performance.now());
      try { stop(); } catch {}
    };
  }, [stop]);

  return (
    <div className="flex h-full flex-col max-h-screen">
      {/* Используем новый трехпанельный layout с WorkspaceShell */}
      <WorkspaceShell />
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OperatingMode } from '@/lib/types';
import { ChatCircle, Image, Code, Gear } from '@phosphor-icons/react';

interface ModeSelectorProps {
  currentMode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
}

export function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  const modes = [
    {
      id: 'chat' as const,
      label: 'Чат',
      icon: ChatCircle,
      description: 'Беседа с ИИ агентами',
    },
    {
      id: 'image-creator' as const,
      label: 'Создание изображений',
      icon: Image,
      description: 'Генерация и редактирование изображений',
    },
    {
      id: 'workspace' as const,
      label: 'Рабочее пространство',
      icon: Code,
      description: 'Файлы проекта и редактор кода',
    },
  ];

  return (
    <div className="flex gap-2 p-2 bg-card rounded-lg">
      {modes.map((mode) => (
        <Button
          key={mode.id}
          variant={currentMode === mode.id ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onModeChange(mode.id)}
          className={cn(
            "flex items-center gap-2 transition-all",
            currentMode === mode.id 
              ? "bg-primary text-primary-foreground shadow-lg" 
              : "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <mode.icon size={16} weight={currentMode === mode.id ? 'fill' : 'regular'} />
          <span className="font-medium">{mode.label}</span>
        </Button>
      ))}
    </div>
  );
}
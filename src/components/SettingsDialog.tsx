import { useState, useMemo } from 'react';
import { useKV } from '@/shims/spark-hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Gear, Play, Stop, Database, Broom } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useVoice } from '@/hooks/useVoice';
import { config, validateConfig, isConfigured } from '@/lib/config';
import { dataMigration } from '@/lib/services/data-migration';
import { DataCleanup } from '@/components/ui/data-cleanup';

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useKV<string>('selected-voice', '21masSU9f4isSNm7Egqd');
  const [systemPrompt, setSystemPrompt] = useKV<string>('system-prompt', 
    'Вы - умный помощник, который отвечает на русском языке. Будьте полезными, точными и дружелюбными.'
  );
  
  const voice = useVoice();
  const { tts, stt } = voice;
  const { state: ttsState, voices, selectedVoice: ttsSelectedVoice, setSelectedVoice: setTTSVoice, speak, stop } = tts;
  const { state: voiceState } = stt;
  const validation = useMemo(() => validateConfig(), []);
  const features = config.features;
  
  // Информация о миграции
  const [migrationInfo, setMigrationInfo] = useState(dataMigration.getMigrationInfo());
  
  // Обновляем информацию о миграции при открытии диалога
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setMigrationInfo(dataMigration.getMigrationInfo());
    }
  };

  const handleSaveSettings = () => {
    // Синхронизация голоса с TTS хуком
    if (selectedVoice) {
      setTTSVoice(selectedVoice);
    }
    toast.success('Настройки сохранены!');
    setIsOpen(false);
  };

  const testVoice = async () => {
    if (!selectedVoice) {
      toast.error('Сначала выберите голос');
      return;
    }

    if (ttsState.isPlaying) {
      stop();
      return;
    }

    const isAvailable = () => isConfigured.elevenlabs();

    try {
      await speak('Привет! Это тестирование выбранного голоса ElevenLabs. Голос звучит хорошо для русского языка.');
      toast.success('Воспроизведение тестовой фразы...');
    } catch (error) {
      console.error('TTS test error:', JSON.stringify(error, null, 2));
      toast.error('Ошибка при тестировании голоса');
    }
  };

  const isAvailable = () => isConfigured.elevenlabs();

  // Обработка завершения очистки данных
  const handleCleanupComplete = () => {
    setMigrationInfo(dataMigration.getMigrationInfo());
    toast.success('Настройки моделей обновлены', {
      description: 'Требуется перезагрузить приложение'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="bg-orange-600 text-black hover:bg-orange-500 shadow-[0_0_14px_rgba(255,102,0,0.35)]">
          <Gear size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-neutral-1 text-neutral-12 border border-orange-500/25 shadow-[0_0_32px_rgba(255,102,0,0.28)] backdrop-blur">
        <DialogHeader>
          <DialogTitle className="text-foreground">Настройки</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Настройте голосовые возможности, системный промпт и управление данными
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-neutral-2/90 border border-orange-500/25 shadow-[0_0_15px_rgba(255,102,0,0.22)]">
            <TabsTrigger value="general" className="text-neutral-11 hover:text-orange-300 data-[state=active]:bg-orange-600/90 data-[state=active]:text-black data-[state=active]:shadow-[0_0_15px_rgba(255,102,0,0.35)]">Общие</TabsTrigger>
            <TabsTrigger value="models" className="text-neutral-11 hover:text-orange-300 data-[state=active]:bg-orange-600/90 data-[state=active]:text-black data-[state=active]:shadow-[0_0_15px_rgba(255,102,0,0.35)]">Модели</TabsTrigger>
            <TabsTrigger value="data" className="text-neutral-11 hover:text-orange-300 data-[state=active]:bg-orange-600/90 data-[state=active]:text-black data-[state=active]:shadow-[0_0_15px_rgba(255,102,0,0.35)]">Данные</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-6 py-4">
            {/* Подсказки/предупреждения по конфигурации */}
            {!validation.isValid && (
              <div
                role="alert"
                className="rounded-md border border-yellow-600/50 bg-yellow-950/30 text-yellow-200 p-3 text-sm shadow-[0_0_18px_rgba(255,153,0,0.18)]"
              >
                <div className="font-medium mb-1">⚠️ Обнаружены проблемы конфигурации</div>
                <ul className="list-disc pl-5 space-y-1">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Статусы включенных фич и настроек */}
            <div className="space-y-1 text-xs">
              <div className="font-medium text-foreground">Состояние функций</div>
              {features.agentSystem && (
                <p className={isConfigured.openrouter() ? 'text-green-400' : 'text-yellow-400'}>
                  {isConfigured.openrouter()
                    ? '✅ OpenRouter настроен (для агентной системы)'
                    : '⚠️ OpenRouter API ключ не настроен. Добавьте VITE_OPENROUTER_API_KEY.'}
                </p>
              )}
              {features.voiceSynthesis && (
                <p className={isConfigured.elevenlabs() ? 'text-green-400' : 'text-yellow-400'}>
                  {isConfigured.elevenlabs()
                    ? '✅ ElevenLabs настроен (синтез речи)'
                    : '⚠️ ElevenLabs API ключ не настроен. Добавьте VITE_ELEVENLABS_API_KEY.'}
                </p>
              )}
              {features.realTimeVectorSearch && (
                <>
                  <p className={isConfigured.openai() ? 'text-green-400' : 'text-yellow-400'}>
                    {isConfigured.openai()
                      ? '✅ OpenAI настроен (embeddings)'
                      : '⚠️ OpenAI API ключ не настроен. Добавьте VITE_OPENAI_API_KEY.'}
                  </p>
                  <p className={isConfigured.qdrant() ? 'text-green-400' : 'text-yellow-400'}>
                    {isConfigured.qdrant()
                      ? '✅ Qdrant URL настроен (vector search)'
                      : '⚠️ Qdrant URL не настроен. Добавьте VITE_QDRANT_URL.'}
                  </p>
                </>
              )}
            </div>

            {/* Выбор голоса */}
            <div className="space-y-2">
              <Label htmlFor="voice-select" className="text-foreground">
                Голос ElevenLabs для озвучивания
              </Label>
              <div className="flex gap-2">
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger className="bg-neutral-2 border border-orange-500/25 text-neutral-12 flex-1 focus-visible:ring-orange-500/40">
                    <SelectValue placeholder="Выберите голос..." />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-1 border border-orange-500/25">
                    {voices && Array.isArray(voices) ? (
                      voices.map((voice) => (
                        <SelectItem 
                          key={voice.id} 
                          value={voice.id}
                          className="text-neutral-12 hover:bg-orange-500/15"
                        >
                          {voice.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>Голоса не загружены</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testVoice}
                  disabled={!selectedVoice || !isAvailable()}
                  className="border border-orange-500/35 bg-neutral-2 text-orange-200 hover:bg-orange-500/15 px-3"
                >
                  {ttsState.isPlaying ? (
                    <Stop size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                </Button>
              </div>
              {!isAvailable() && (
                <p className="text-xs text-yellow-400">
                  ElevenLabs API ключ не настроен. Добавьте VITE_ELEVENLABS_API_KEY в переменные окружения.
                </p>
              )}
            </div>

            {/* Системный промпт */}
            <div className="space-y-2">
              <Label htmlFor="system-prompt" className="text-foreground">
                Системный промпт
              </Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Введите системный промпт для ИИ..."
                className="min-h-[120px] bg-neutral-2 border border-orange-500/25 text-neutral-12 placeholder:text-neutral-9 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Этот промпт будет использоваться как системная инструкция для всех взаимодействий с ИИ
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="models" className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                <h3 className="text-lg font-medium">Управление моделями</h3>
              </div>
              
              {/* Информация о версии миграции */}
              <div className="p-4 bg-neutral-2/90 border border-orange-500/25 rounded-lg shadow-[0_0_18px_rgba(255,102,0,0.2)]">
                <h4 className="font-medium mb-2">Информация о данных моделей</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Текущая версия:</span>
                    <div className="font-medium">{migrationInfo.currentVersion}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Актуальная версия:</span>
                    <div className="font-medium">{migrationInfo.latestVersion}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-muted-foreground">Статус:</span>
                  <div className={`font-medium ${
                    migrationInfo.currentVersion === migrationInfo.latestVersion 
                      ? 'text-green-600' 
                      : 'text-yellow-600'
                  }`}>
                    {migrationInfo.currentVersion === migrationInfo.latestVersion 
                      ? '✅ Данные актуальны' 
                      : '⚠️ Требуется обновление'}
                  </div>
                </div>
                {migrationInfo.history.length > 0 && (
                  <div className="mt-2">
                    <span className="text-muted-foreground">Последняя миграция:</span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(migrationInfo.history[migrationInfo.history.length - 1].timestamp).toLocaleString('ru-RU')}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Кнопка быстрой очистки */}
              <div className="flex items-center justify-between p-4 border border-orange-500/25 bg-neutral-2/90 rounded-lg shadow-[0_0_18px_rgba(255,102,0,0.2)]">
                <div>
                  <h4 className="font-medium">Сброс настроек моделей</h4>
                  <p className="text-sm text-muted-foreground">
                    Очистить все данные моделей и вернуться к настройкам по умолчанию
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    // Небольшая задержка чтобы диалог успел закрыться
                    setTimeout(() => {
                      toast.info('Перейдите в вкладку "Данные" для очистки');
                    }, 100);
                  }}
                  className="border border-orange-500/35 bg-neutral-2 text-orange-200 hover:bg-orange-500/15"
                >
                  <Broom className="h-4 w-4 mr-2" />
                  Очистить
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="data" className="space-y-6 py-4">
            <DataCleanup onCleanupComplete={handleCleanupComplete} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
            className="border border-orange-500/35 bg-neutral-2 text-orange-200 hover:bg-orange-500/15"
          >
            Отмена
          </Button>
          <Button 
            onClick={handleSaveSettings}
            className="bg-orange-600 hover:bg-orange-500 text-black shadow-[0_0_18px_rgba(255,102,0,0.32)]"
          >
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
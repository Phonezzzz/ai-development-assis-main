import { elevenLabsService, ElevenLabsTranscriptionOptions } from '@/lib/services/elevenlabs';

// STT service using local proxy endpoint /api/stt/transcribe
type TranscribeOptions = {
  languageCode?: string;
  modelId?: string;
  diarize?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function transcribeAudio(blob: Blob, opts: TranscribeOptions = {}): Promise<string> {
  const options: ElevenLabsTranscriptionOptions = {
    languageCode: opts.languageCode,
    modelId: opts.modelId,
    diarize: opts.diarize,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  };

  const result = await elevenLabsService.transcribeAudio(blob, options);
  return result.text;
}

function isConfigured(): boolean {
  return elevenLabsService.isConfigured();
}

export const sttService = {
  isConfigured,
  transcribeAudio,
};
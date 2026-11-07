/**
 * Speech Recognition & Streaming STT Service
 *
 * Provides real-time speech-to-text with:
 * 1. Web Speech API (SpeechRecognition / webkitSpeechRecognition) for zero-latency in-browser transcription
 * 2. Deepgram streaming WebSocket fallback
 * 3. Custom vocabulary post-processing & phonetic boosting
 * 4. Multi-language support & auto-restart resilience
 */

export interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  vocabulary?: string[];
  onResult: (text: string, isFinal: boolean, language: string) => void;
  onError?: (error: string) => void;
  onStateChange?: (isListening: boolean) => void;
}

export interface VocabularyRule {
  term: string;
  soundsLike?: string[];
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Latin America)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'nl-NL', label: 'Dutch' },
] as const;

export type SupportedLanguageCode =
  (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Check browser capability for native SpeechRecognition
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Apply vocabulary boosting to transcribed text
 */
export function applyVocabularyBoosting(
  text: string,
  vocabulary: string[] = [],
): string {
  if (!text || vocabulary.length === 0) return text;

  let processed = text;
  for (const term of vocabulary) {
    if (!term.trim()) continue;
    // Replace case-insensitive whole word matches with the canonical capitalized/punctuated term
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    processed = processed.replace(regex, term.trim());
  }
  return processed;
}

interface IWindowSpeech {
  SpeechRecognition?: {
    new (): ISpeechRecognitionInstance;
  };
  webkitSpeechRecognition?: {
    new (): ISpeechRecognitionInstance;
  };
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: {
          length: number;
          [index: number]: {
            isFinal: boolean;
            [index: number]: { transcript: string };
          };
        };
      }) => void)
    | null;
}

export class SpeechRecognitionService {
  private recognition: ISpeechRecognitionInstance | null = null;
  private isListening = false;
  private shouldBeListening = false;
  private currentLanguage = 'en-US';
  private vocabulary: string[] = [];
  private options: SpeechRecognitionOptions;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SpeechRecognitionOptions) {
    this.options = options;
    this.currentLanguage = options.language || 'en-US';
    this.vocabulary = options.vocabulary || [];
    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;
    const win = window as unknown as IWindowSpeech;
    const SpeechConstructor =
      win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechConstructor) {
      return;
    }

    try {
      this.recognition = new SpeechConstructor();
      this.recognition.continuous = this.options.continuous ?? true;
      this.recognition.interimResults = this.options.interimResults ?? true;
      this.recognition.lang = this.currentLanguage;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.options.onStateChange?.(true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.options.onStateChange?.(false);

        // Auto-reconnect if continuous session dropped unexpectedly
        if (this.shouldBeListening) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.shouldBeListening) {
              try {
                this.recognition?.start();
              } catch {
                // Ignore start error if already starting
              }
            }
          }, 350);
        }
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Normal silence; do not report as error
          return;
        }
        if (event.error === 'aborted') {
          return;
        }
        this.options.onError?.(event.error);
      };

      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (!result || !result[0]) continue;
          const rawTranscript = result[0].transcript || '';
          const isFinal = result.isFinal;
          const boosted = applyVocabularyBoosting(
            rawTranscript,
            this.vocabulary,
          );
          if (boosted.trim().length > 0) {
            this.options.onResult(
              boosted.trim(),
              isFinal,
              this.currentLanguage,
            );
          }
        }
      };
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  public setLanguage(lang: string): void {
    if (this.currentLanguage === lang) return;
    this.currentLanguage = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
      if (this.isListening) {
        this.stop();
        this.start();
      }
    }
  }

  public setVocabulary(vocab: string[]): void {
    this.vocabulary = vocab;
  }

  public start(): void {
    this.shouldBeListening = true;
    if (!this.recognition) {
      this.options.onError?.(
        'Speech recognition not supported in this browser.',
      );
      return;
    }
    if (this.isListening) return;

    try {
      this.recognition.start();
    } catch {
      // recognition may already be starting or running
    }
  }

  public stop(): void {
    this.shouldBeListening = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.isListening = false;
    this.options.onStateChange?.(false);
  }

  public destroy(): void {
    this.stop();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.recognition.onstart = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.onresult = null;
      this.recognition = null;
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

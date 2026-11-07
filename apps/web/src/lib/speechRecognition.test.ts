import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyVocabularyBoosting,
  isSpeechRecognitionSupported,
  SpeechRecognitionService,
  SUPPORTED_LANGUAGES,
} from './speechRecognition';

describe('speechRecognition service & vocabulary boosting suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('boosts and normalizes terms according to custom vocabulary', () => {
    const text = 'we are discussing kubernetes and webrtc latency today';
    const vocab = ['Kubernetes', 'WebRTC', 'MeetIT'];
    const boosted = applyVocabularyBoosting(text, vocab);
    expect(boosted).toBe(
      'we are discussing Kubernetes and WebRTC latency today',
    );
  });

  it('handles empty or blank vocabulary cleanly', () => {
    expect(applyVocabularyBoosting('hello world', [])).toBe('hello world');
    expect(applyVocabularyBoosting('', ['Kubernetes'])).toBe('');
  });

  it('correctly checks browser speech recognition availability', () => {
    const originalWin = globalThis.window;
    // @ts-expect-error test mock
    globalThis.window = {};
    expect(isSpeechRecognitionSupported()).toBe(false);

    // @ts-expect-error test mock
    globalThis.window = { webkitSpeechRecognition: vi.fn() };
    expect(isSpeechRecognitionSupported()).toBe(true);
    globalThis.window = originalWin;
  });

  it('provides comprehensive list of supported languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(10);
    expect(SUPPORTED_LANGUAGES.some((l) => l.code === 'en-US')).toBe(true);
    expect(SUPPORTED_LANGUAGES.some((l) => l.code === 'es-ES')).toBe(true);
  });

  it('initializes and triggers speech recognition lifecycle', () => {
    const mockStart = vi.fn();
    const mockStop = vi.fn();
    const mockAbort = vi.fn();

    class MockRecognition {
      continuous = true;
      interimResults = true;
      lang = 'en-US';
      start = vi.fn().mockImplementation(() => {
        mockStart();
        this.onstart?.();
      });
      stop = mockStop;
      abort = mockAbort;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
    }

    const originalWin = globalThis.window;
    globalThis.window = {
      SpeechRecognition: MockRecognition,
    } as unknown as Window & typeof globalThis;

    const onResult = vi.fn();
    const onStateChange = vi.fn();
    const service = new SpeechRecognitionService({
      language: 'en-US',
      vocabulary: ['MeetIT'],
      onResult,
      onStateChange,
    });

    service.start();
    expect(mockStart).toHaveBeenCalled();

    service.setLanguage('fr-FR');
    expect(mockStop).toHaveBeenCalled();

    service.destroy();
    expect(mockAbort).toHaveBeenCalled();

    globalThis.window = originalWin;
  });
});

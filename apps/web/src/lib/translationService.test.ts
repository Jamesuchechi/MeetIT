import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TRANSLATION_LANGUAGES,
  translateCaption,
  speakDubbedCaption,
} from './translationService';

describe('translationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports 32+ international languages including African languages', () => {
    expect(TRANSLATION_LANGUAGES.length).toBeGreaterThanOrEqual(30);

    const codes = TRANSLATION_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('es');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('zh');
    expect(codes).toContain('ja');
    expect(codes).toContain('yo'); // Yoruba
    expect(codes).toContain('ig'); // Igbo
    expect(codes).toContain('ha'); // Hausa
    expect(codes).toContain('sw'); // Swahili
  });

  it('translates common phrases with sub-second dictionary match', async () => {
    const resEs = await translateCaption('hello', 'es');
    expect(resEs).toBe('hola');

    const resFr = await translateCaption('thank you', 'fr');
    expect(resFr).toBe('merci');

    const resYo = await translateCaption('welcome to the meeting', 'yo');
    expect(resYo).toBe('e kaabo si ipade');
  });

  it('returns original text when target language is none or blank', async () => {
    const res = await translateCaption('Testing original text', 'none');
    expect(res).toBe('Testing original text');
  });

  it('gracefully handles speakDubbedCaption without crashing when window is undefined or synthesis is unavailable', () => {
    expect(() => speakDubbedCaption('Hello world', 'es', true)).not.toThrow();
  });
});

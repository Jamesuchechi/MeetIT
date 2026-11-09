import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptionsOverlay, type DisplayCaptionCue } from './CaptionsOverlay';

describe('CaptionsOverlay', () => {
  const sampleCues: DisplayCaptionCue[] = [
    {
      id: 'cue-1',
      from: 'peer-1',
      displayName: 'Alice',
      text: 'Good morning everyone, welcome to the sprint review.',
      ts: Date.now(),
      isFinal: true,
      translatedText: 'E kaaro gbogbo eniyan, kaabo si atunyewo sprint.',
      targetLanguage: 'yo',
    },
  ];

  it('renders original caption and translated text markup', () => {
    const html = renderToStaticMarkup(<CaptionsOverlay cues={sampleCues} />);

    expect(html).toContain('Alice:');
    expect(html).toContain(
      'Good morning everyone, welcome to the sprint review.',
    );
    expect(html).toContain('E kaaro gbogbo eniyan, kaabo si atunyewo sprint.');
    expect(html).toContain('data-testid="translated-caption-text"');
  });

  it('returns empty string when no cues are provided', () => {
    const html = renderToStaticMarkup(<CaptionsOverlay cues={[]} />);
    expect(html).toBe('');
  });
});

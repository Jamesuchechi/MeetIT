import { describe, expect, it } from 'vitest';
import { FakeTransport } from './index.js';

describe('FakeTransport', () => {
  it('requires a connection before publishing', async () => {
    const transport = new FakeTransport();
    const track = { kind: 'audio' } as MediaStreamTrack;
    await expect(transport.publish(track, 'microphone')).rejects.toThrow(
      'must be connected',
    );
  });
});

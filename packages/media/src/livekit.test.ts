import { describe, expect, it } from 'vitest';
import { LiveKitTransport } from './livekit.js';

describe('LiveKitTransport', () => {
  it('instantiates and implements MediaTransport interface methods', () => {
    const transport = new LiveKitTransport();
    expect(typeof transport.connect).toBe('function');
    expect(typeof transport.disconnect).toBe('function');
    expect(typeof transport.publish).toBe('function');
    expect(typeof transport.unpublish).toBe('function');
    expect(typeof transport.replaceTrack).toBe('function');
    expect(typeof transport.getStats).toBe('function');
    expect(typeof transport.getPeerStats).toBe('function');
    expect(typeof transport.setBandwidthMode).toBe('function');
    expect(typeof transport.setTrackVisibility).toBe('function');
    expect(typeof transport.setTrackResolutionTier).toBe('function');
    expect(typeof transport.on).toBe('function');
  });

  it('throws descriptive error if connect is called without livekit credentials', async () => {
    const transport = new LiveKitTransport();
    await expect(
      transport.connect({
        roomId: 'abc-defg-hij',
        selfId: 'self-1',
        iceServers: [],
      }),
    ).rejects.toThrow('LiveKitTransport requires options.livekit');
  });

  it('manages bandwidth modes and updates internal mode state', async () => {
    const transport = new LiveKitTransport();
    expect(transport.getBandwidthMode()).toBe('standard');

    await transport.setBandwidthMode('data_saver');
    expect(transport.getBandwidthMode()).toBe('data_saver');

    await transport.setBandwidthMode('audio_only');
    expect(transport.getBandwidthMode()).toBe('audio_only');
  });

  it('returns aggregated and peer network stats structure', async () => {
    const transport = new LiveKitTransport();
    const stats = await transport.getStats();
    expect(stats.bytesReceived).toBe(0);
    expect(stats.bytesSent).toBe(0);

    const peerStats = await transport.getPeerStats();
    expect(typeof peerStats).toBe('object');
  });

  it('handles disconnect and emits closed connection state', async () => {
    const transport = new LiveKitTransport();
    let closedEmitted = false;
    transport.on('connectionStateChanged', (ev) => {
      if (ev.state === 'closed') {
        closedEmitted = true;
      }
    });

    await transport.disconnect();
    expect(closedEmitted).toBe(true);
  });
});

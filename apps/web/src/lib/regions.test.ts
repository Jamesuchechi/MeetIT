import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSupportedRegions,
  getSavedPreferredRegion,
  probeRegionLatency,
  selectOptimalRegion,
  setSavedPreferredRegion,
  PREFERRED_REGION_STORAGE_KEY,
  DEFAULT_FALLBACK_REGIONS,
} from './regions';
import type { LiveKitRegion } from '@meetit/protocol';

describe('regions module', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    };

    globalThis.window = {
      localStorage: mockStorage as Storage,
    } as unknown as Window & typeof globalThis;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    store = {};
  });

  it('gets and sets preferred region in localStorage', () => {
    expect(getSavedPreferredRegion()).toBeNull();
    setSavedPreferredRegion('eu-west');
    expect(getSavedPreferredRegion()).toBe('eu-west');
    expect(window.localStorage.getItem(PREFERRED_REGION_STORAGE_KEY)).toBe(
      'eu-west',
    );
    setSavedPreferredRegion(null);
    expect(getSavedPreferredRegion()).toBeNull();
  });

  it('fetches supported regions from signaling endpoint', async () => {
    const mockRegions: LiveKitRegion[] = [
      {
        id: 'us-east',
        name: 'US East',
        pingUrl: 'https://us.livekit/health',
        isDefault: true,
      },
      { id: 'eu-west', name: 'EU West', pingUrl: 'https://eu.livekit/health' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: mockRegions }),
    } as Response);

    const regions = await fetchSupportedRegions('https://signaling.meetit.app');
    expect(regions).toEqual(mockRegions);
  });

  it('falls back to default regions when endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error'),
    );
    const regions = await fetchSupportedRegions('https://signaling.meetit.app');
    expect(regions).toEqual(DEFAULT_FALLBACK_REGIONS);
  });

  it('probes latency using fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as Response);
    const rtt = await probeRegionLatency('https://us.livekit/health');
    expect(rtt).toBeGreaterThanOrEqual(0);
    expect(rtt).toBeLessThan(Infinity);
  });

  it('returns Infinity when latency probe fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Timeout'));
    const rtt = await probeRegionLatency('https://us.livekit/health');
    expect(rtt).toBe(Infinity);
  });

  it('selects lowest-latency region automatically', async () => {
    const candidateRegions: LiveKitRegion[] = [
      {
        id: 'us-east',
        name: 'US East',
        pingUrl: 'https://us.livekit/health',
        isDefault: true,
      },
      { id: 'eu-west', name: 'EU West', pingUrl: 'https://eu.livekit/health' },
      {
        id: 'ap-southeast',
        name: 'Asia Pacific',
        pingUrl: 'https://ap.livekit/health',
      },
    ];

    // Mock fetch to simulate latency: eu-west lowest
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('eu.livekit')) {
        await new Promise((r) => setTimeout(r, 10));
      } else {
        await new Promise((r) => setTimeout(r, 60));
      }
      return { ok: true } as Response;
    });

    const result = await selectOptimalRegion(candidateRegions);
    expect(result.selectedRegion.id).toBe('eu-west');
    expect(result.latencies['eu-west']).toBeDefined();
  });

  it('honors manual saved preference when available', async () => {
    const candidateRegions: LiveKitRegion[] = [
      {
        id: 'us-east',
        name: 'US East',
        pingUrl: 'https://us.livekit/health',
        isDefault: true,
      },
      { id: 'eu-west', name: 'EU West', pingUrl: 'https://eu.livekit/health' },
    ];

    setSavedPreferredRegion('us-east');
    const result = await selectOptimalRegion(candidateRegions);
    expect(result.selectedRegion.id).toBe('us-east');
  });
});

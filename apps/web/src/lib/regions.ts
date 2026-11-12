import type { LiveKitRegion } from '@meetit/protocol';

export const PREFERRED_REGION_STORAGE_KEY = 'meetit_preferred_region';

export const DEFAULT_FALLBACK_REGIONS: LiveKitRegion[] = [
  {
    id: 'default',
    name: 'Auto (Global Edge)',
    pingUrl: 'https://meetit.livekit.cloud/health',
    isDefault: true,
  },
];

export function getSavedPreferredRegion(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(PREFERRED_REGION_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage access failures
  }
  return null;
}

export function setSavedPreferredRegion(regionId: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (regionId) {
        window.localStorage.setItem(PREFERRED_REGION_STORAGE_KEY, regionId);
      } else {
        window.localStorage.removeItem(PREFERRED_REGION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore localStorage access failures
  }
}

export async function fetchSupportedRegions(
  baseUrl = '',
): Promise<LiveKitRegion[]> {
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/regions`;
  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return DEFAULT_FALLBACK_REGIONS;
    }
    const data = (await res.json()) as { regions?: LiveKitRegion[] };
    if (Array.isArray(data.regions) && data.regions.length > 0) {
      return data.regions;
    }
  } catch {
    // Return fallback on network failure
  }
  return DEFAULT_FALLBACK_REGIONS;
}

export async function probeRegionLatency(
  pingUrl: string,
  timeoutMs = 2500,
): Promise<number> {
  const start = performance.now();
  try {
    await fetch(pingUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return Math.round(performance.now() - start);
  } catch {
    return Infinity;
  }
}

export async function selectOptimalRegion(regions: LiveKitRegion[]): Promise<{
  selectedRegion: LiveKitRegion;
  latencies: Record<string, number>;
}> {
  if (regions.length === 0) {
    return {
      selectedRegion: DEFAULT_FALLBACK_REGIONS[0]!,
      latencies: {},
    };
  }

  if (regions.length === 1) {
    return {
      selectedRegion: regions[0]!,
      latencies: { [regions[0]!.id]: 0 },
    };
  }

  // Check if user has an explicit manual region preference saved
  const savedPreference = getSavedPreferredRegion();
  if (savedPreference) {
    const matched = regions.find((r) => r.id === savedPreference);
    if (matched) {
      return {
        selectedRegion: matched,
        latencies: {},
      };
    }
  }

  // Measure latency to all candidate regions in parallel
  const probeEntries = await Promise.all(
    regions.map(async (reg) => {
      const rtt = await probeRegionLatency(reg.pingUrl);
      return [reg.id, rtt] as const;
    }),
  );

  const latencies = Object.fromEntries(probeEntries);

  let bestRegion = regions[0]!;
  let lowestRtt = Infinity;

  for (const reg of regions) {
    const rtt = latencies[reg.id] ?? Infinity;
    if (rtt < lowestRtt) {
      lowestRtt = rtt;
      bestRegion = reg;
    }
  }

  // If all probes failed (e.g. offline/blocked), use the default region
  if (lowestRtt === Infinity) {
    const defaultReg = regions.find((r) => r.isDefault) ?? regions[0]!;
    return {
      selectedRegion: defaultReg,
      latencies,
    };
  }

  return {
    selectedRegion: bestRegion,
    latencies,
  };
}

/**
 * Exponential moving average to smooth RTT jitter across consecutive probes
 */
export function smoothLatency(
  previousRtt: number,
  newRtt: number,
  alpha = 0.35,
): number {
  if (previousRtt === Infinity) return newRtt;
  if (newRtt === Infinity) return previousRtt;
  return Math.round(alpha * newRtt + (1 - alpha) * previousRtt);
}

/**
 * Determine failover region when current edge degrades or disconnects.
 * Prioritizes cascadesTo targets, then lowest-latency healthy alternative.
 */
export function getFailoverRegion(
  currentRegionId: string,
  regions: LiveKitRegion[],
  latencies?: Record<string, number>,
): LiveKitRegion {
  if (regions.length === 0) return DEFAULT_FALLBACK_REGIONS[0]!;
  if (regions.length === 1) return regions[0]!;

  const current = regions.find((r) => r.id === currentRegionId);
  const remaining = regions.filter((r) => r.id !== currentRegionId);

  // 1. If current region specifies explicit cascading destinations, check them first
  if (current?.cascadesTo && current.cascadesTo.length > 0) {
    const candidates = remaining.filter((r) =>
      current.cascadesTo!.includes(r.id),
    );
    if (candidates.length > 0) {
      if (!latencies) return candidates[0]!;
      let best = candidates[0]!;
      let minRtt = latencies[best.id] ?? Infinity;
      for (const cand of candidates) {
        const rtt = latencies[cand.id] ?? Infinity;
        if (rtt < minRtt) {
          minRtt = rtt;
          best = cand;
        }
      }
      if (minRtt < Infinity) return best;
    }
  }

  // 2. Fall back to lowest healthy latency among remaining regions
  if (latencies) {
    let bestRemaining = remaining[0]!;
    let minRtt = latencies[bestRemaining.id] ?? Infinity;
    for (const reg of remaining) {
      const rtt = latencies[reg.id] ?? Infinity;
      if (rtt < minRtt) {
        minRtt = rtt;
        bestRemaining = reg;
      }
    }
    if (minRtt < Infinity) return bestRemaining;
  }

  // 3. Fall back to default or first remaining
  return remaining.find((r) => r.isDefault) ?? remaining[0]!;
}

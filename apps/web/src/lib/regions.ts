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

/**
 * Grid carbon intensity in grams of CO2e per kilowatt-hour (gCO2/kWh) by cloud region.
 */
export const REGION_CARBON_INTENSITY: Record<string, number> = {
  'us-east': 379, // PJM Interconnection (gas/coal/nuclear)
  'us-west': 112, // Pacific Northwest (hydro-dominant)
  'eu-central': 285, // Central Europe (Germany/Frankfurt)
  'eu-north': 24, // Nordic grid (Sweden/Norway 95%+ hydro/wind/nuclear)
  'ap-southeast': 415, // Singapore (gas-dominant)
  default: 250, // Global average
};

export interface CarbonAwareSelection {
  region: LiveKitRegion;
  isGreenRouting: boolean;
  carbonSavedGPerKwh: number;
}

/**
 * Carbon-aware region selection:
 * Picks a greener datacenter region when latency is within `maxLatencyPenaltyMs` (default 25ms)
 * of the lowest-latency region. Reduces meeting carbon footprint without perceptible delay.
 */
export function getCarbonAwareRegion(
  regions: LiveKitRegion[],
  latencies: Record<string, number>,
  maxLatencyPenaltyMs = 25,
): CarbonAwareSelection {
  if (regions.length === 0) {
    return {
      region: DEFAULT_FALLBACK_REGIONS[0]!,
      isGreenRouting: false,
      carbonSavedGPerKwh: 0,
    };
  }

  // Find lowest latency region
  let fastestRegion = regions[0]!;
  let minLatency = latencies[fastestRegion.id] ?? Infinity;

  for (const reg of regions) {
    const lat = latencies[reg.id] ?? Infinity;
    if (lat < minLatency) {
      minLatency = lat;
      fastestRegion = reg;
    }
  }

  if (minLatency === Infinity) {
    return {
      region: fastestRegion,
      isGreenRouting: false,
      carbonSavedGPerKwh: 0,
    };
  }

  // Eligible regions are those within the latency penalty threshold
  const eligible = regions.filter((reg) => {
    const lat = latencies[reg.id] ?? Infinity;
    return lat <= minLatency + maxLatencyPenaltyMs;
  });

  const fastestIntensity =
    REGION_CARBON_INTENSITY[fastestRegion.id] ??
    REGION_CARBON_INTENSITY['default']!;

  let greenestRegion = fastestRegion;
  let lowestIntensity = fastestIntensity;

  for (const reg of eligible) {
    const intensity =
      REGION_CARBON_INTENSITY[reg.id] ?? REGION_CARBON_INTENSITY['default']!;
    if (intensity < lowestIntensity) {
      lowestIntensity = intensity;
      greenestRegion = reg;
    }
  }

  const isGreenRouting = greenestRegion.id !== fastestRegion.id;
  const carbonSavedGPerKwh = Math.max(0, fastestIntensity - lowestIntensity);

  return {
    region: greenestRegion,
    isGreenRouting,
    carbonSavedGPerKwh,
  };
}

export interface CarbonFootprintReport {
  totalCarbonGrams: number;
  carMilesEquivalent: number;
  commuteSavedGrams: number;
  treesOffsetEquivalent: number;
}

/**
 * Estimates meeting carbon footprint vs in-person commuting:
 * Video streaming emits ~0.2-0.5 g CO2e per MB transferred + SFU server slice.
 * A typical 15-mile round-trip vehicle commute produces ~6,000 g CO2e.
 */
export function estimateMeetingCarbonFootprint(
  durationSeconds: number,
  participantCount: number,
  egressBytes: number,
  regionId = 'default',
): CarbonFootprintReport {
  const intensity =
    REGION_CARBON_INTENSITY[regionId] ?? REGION_CARBON_INTENSITY['default']!;

  const egressMb = egressBytes / (1024 * 1024);
  // Average edge network energy consumption: ~0.0006 kWh per MB transferred
  const kwhFromData = egressMb * 0.0006;

  // Server slice energy: ~0.0002 kWh per participant-minute
  const participantMinutes =
    (durationSeconds / 60) * Math.max(1, participantCount);
  const kwhFromServer = participantMinutes * 0.0002;

  const totalKwh = kwhFromData + kwhFromServer;
  const totalCarbonGrams = Math.round(totalKwh * intensity * 10) / 10;

  // In-person commute savings: assume avoiding a 10-mile car trip per remote attendee (~404g/mile)
  const commuteSavedGrams = Math.max(1, participantCount - 1) * 4040; // 10 miles * 404 g/mile
  const carMilesEquivalent = Math.round((totalCarbonGrams / 404) * 100) / 100;
  const treesOffsetEquivalent =
    Math.round((commuteSavedGrams / 21770) * 1000) / 1000; // 1 urban tree absorbs ~21.77 kg/year

  return {
    totalCarbonGrams,
    carMilesEquivalent,
    commuteSavedGrams,
    treesOffsetEquivalent,
  };
}

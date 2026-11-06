import { useEffect, useState, useCallback } from 'react';

export type BackendHealthStatus = 'checking' | 'waking' | 'live' | 'offline';

export interface BackendHealthState {
  status: BackendHealthStatus;
  latencyMs: number | null;
  lastChecked: Date | null;
  serverUrl: string;
  isColdStart: boolean;
  pingNow: () => Promise<void>;
}

const DEFAULT_SIGNALING_WS_URL =
  import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8787';

export function getSignalingHttpUrl(): string {
  return DEFAULT_SIGNALING_WS_URL.replace(/^wss:/i, 'https:').replace(
    /^ws:/i,
    'http:',
  );
}

export function getSignalingWsUrl(): string {
  return DEFAULT_SIGNALING_WS_URL;
}

// Global shared state across components so multiple indicators stay in sync
let globalStatus: BackendHealthStatus = 'checking';
let globalLatency: number | null = null;
let globalLastChecked: Date | null = null;
let globalIsColdStart = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore listener error
    }
  });
}

function probeWebSocket(wsUrl: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      const timer = window.setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(false);
      }, timeoutMs);

      ws.onopen = () => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(true);
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

export async function pingBackend(): Promise<{
  ok: boolean;
  latencyMs: number | null;
}> {
  const httpUrl = getSignalingHttpUrl();
  const startTime = Date.now();
  globalStatus = 'checking';
  notifyListeners();

  // If request takes longer than 1500ms, mark as "waking" (Render spin-up detection)
  const wakingTimer = window.setTimeout(() => {
    if (globalStatus === 'checking') {
      globalStatus = 'waking';
      globalIsColdStart = true;
      notifyListeners();
    }
  }, 1500);

  const controller = new AbortController();
  // Render cold start can take up to 45 seconds on free tier
  const abortTimer = window.setTimeout(() => controller.abort(), 45000);

  try {
    let succeeded = false;
    try {
      const res = await fetch(`${httpUrl}/healthz`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        succeeded = true;
      }
    } catch {
      // Fallback 1: in case browser CORS blocked the response, try no-cors mode
      try {
        await fetch(`${httpUrl}/healthz`, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });
        succeeded = true;
      } catch {
        // Fallback 2: probe WebSocket connection directly
        succeeded = await probeWebSocket(getSignalingWsUrl(), 5000);
      }
    }

    window.clearTimeout(wakingTimer);
    window.clearTimeout(abortTimer);

    if (succeeded) {
      const latency = Date.now() - startTime;
      globalStatus = 'live';
      globalLatency = latency;
      globalLastChecked = new Date();
      notifyListeners();
      return { ok: true, latencyMs: latency };
    } else {
      globalStatus = 'offline';
      globalLatency = null;
      globalLastChecked = new Date();
      notifyListeners();
      return { ok: false, latencyMs: null };
    }
  } catch {
    window.clearTimeout(wakingTimer);
    window.clearTimeout(abortTimer);
    globalStatus = 'offline';
    globalLatency = null;
    globalLastChecked = new Date();
    notifyListeners();
    return { ok: false, latencyMs: null };
  }
}

// Immediate wake-up trigger on module load
if (typeof window !== 'undefined') {
  void pingBackend();
}

export function useBackendHealth(): BackendHealthState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const update = () => setTick((t) => t + 1);
    listeners.add(update);

    // Periodic heartbeat every 40 seconds to prevent Render spin-down while page is open
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pingBackend();
      }
    }, 40000);

    return () => {
      listeners.delete(update);
      window.clearInterval(interval);
    };
  }, []);

  const pingNow = useCallback(async () => {
    await pingBackend();
  }, []);

  return {
    status: globalStatus,
    latencyMs: globalLatency,
    lastChecked: globalLastChecked,
    serverUrl: getSignalingHttpUrl(),
    isColdStart: globalIsColdStart,
    pingNow,
  };
}

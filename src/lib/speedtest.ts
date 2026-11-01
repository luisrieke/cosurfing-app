import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

import type { NetworkType } from './types';

const BASE = 'https://speed.cloudflare.com';
const DOWN_SIZES = [100_000, 1_000_000, 10_000_000, 25_000_000, 50_000_000];
const UP_SIZES = [100_000, 1_000_000, 5_000_000, 10_000_000];
const PING_ROUNDS = 6;
/** A transfer must take at least this long to be a meaningful sample. */
const MIN_SAMPLE_MS = 250;
/** Stop growing the transfer size once one transfer takes this long. */
const ENOUGH_MS = 2_500;
const PHASE_BUDGET_MS = 8_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOCATION_TIMEOUT_MS = 20_000;

export type SpeedPhase = 'ping' | 'download' | 'upload';

export interface SpeedResult {
  downloadMbps: number;
  uploadMbps: number | null;
  pingMs: number | null;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function timed(url: string, init?: RequestInit): Promise<{ ms: number; bytes: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const start = now();
    const res = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return { ms: now() - start, bytes: buf.byteLength };
  } finally {
    clearTimeout(timer);
  }
}

function nonce(): string {
  return Math.random().toString(36).slice(2);
}

async function measurePing(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < PING_ROUNDS; i++) {
    const { ms } = await timed(`${BASE}/__down?bytes=0&r=${nonce()}`);
    samples.push(ms);
  }
  // The first request includes the TLS handshake.
  return median(samples.slice(1));
}

async function measureTransfer(
  sizes: number[],
  run: (bytes: number) => Promise<{ ms: number; bytes: number }>,
  onSample: (mbps: number) => void,
): Promise<number | null> {
  const samples: number[] = [];
  const started = now();
  for (const size of sizes) {
    // Two transfers per size smooth out a single slow start.
    for (let i = 0; i < 2; i++) {
      const { ms, bytes } = await run(size);
      if (ms >= MIN_SAMPLE_MS) {
        const mbps = (bytes * 8) / (ms / 1000) / 1_000_000;
        samples.push(mbps);
        onSample(mbps);
      }
      if (ms >= ENOUGH_MS || now() - started > PHASE_BUDGET_MS) {
        return samples.length ? median(samples.slice(-4)) : (bytes * 8) / (ms / 1000) / 1_000_000;
      }
    }
  }
  return samples.length ? median(samples.slice(-4)) : null;
}

/**
 * Measures ping, download and upload against Cloudflare's public speed test endpoints
 * (CORS-enabled). Results are medians of the larger transfers.
 */
export async function runSpeedTest(onProgress: (phase: SpeedPhase, value: number | null) => void): Promise<SpeedResult> {
  onProgress('ping', null);
  const pingMs = await measurePing().catch(() => null);
  if (pingMs !== null) onProgress('ping', pingMs);

  onProgress('download', null);
  const downloadMbps = await measureTransfer(
    DOWN_SIZES,
    (bytes) => timed(`${BASE}/__down?bytes=${bytes}&r=${nonce()}`),
    (v) => onProgress('download', v),
  );
  if (downloadMbps === null) throw new Error('download_failed');

  onProgress('upload', null);
  const uploadMbps = await measureTransfer(
    UP_SIZES,
    async (bytes) => {
      const r = await timed(`${BASE}/__up?r=${nonce()}`, { method: 'POST', body: new Uint8Array(bytes) });
      return { ms: r.ms, bytes };
    },
    (v) => onProgress('upload', v),
  ).catch(() => null);

  return { downloadMbps, uploadMbps, pingMs };
}

/** Where and on which network a test ran. The server decides from this whether it was on site. */
export interface TestContext {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  networkType: NetworkType;
}

async function currentNetworkType(): Promise<NetworkType> {
  if (Platform.OS === 'web') {
    const type = (globalThis.navigator as { connection?: { type?: string } } | undefined)?.connection?.type;
    return type === 'wifi' || type === 'ethernet' ? 'wifi' : type === 'cellular' ? 'cellular' : 'unknown';
  }
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET) return 'wifi';
    if (state.type === Network.NetworkStateType.CELLULAR) return 'cellular';
  } catch {
    // fall through
  }
  return 'unknown';
}

async function currentPosition(): Promise<Pick<TestContext, 'lat' | 'lng' | 'accuracyM'>> {
  const none = { lat: null, lng: null, accuracyM: null };
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return none;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!pos) return none;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null };
  } catch {
    return none;
  }
}

/** Captures GPS position and network type; call while the test runs. */
export async function captureTestContext(): Promise<TestContext> {
  const [position, networkType] = await Promise.all([currentPosition(), currentNetworkType()]);
  return { ...position, networkType };
}

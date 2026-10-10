import stationsData from '@/data/stations.json';
import type { BikeCounts, StationInfo } from './types';

export const stations = stationsData as StationInfo[];

const HOURLY_CURVE = [
  0.15, 0.1, 0.08, 0.06, 0.08, 0.2, 0.45, 0.85, 1.0, 0.75, 0.6, 0.65,
  0.75, 0.75, 0.7, 0.75, 0.9, 1.0, 0.95, 0.75, 0.55, 0.4, 0.3, 0.2,
];
const MAX_BIKES_PER_STATION = 40;
const maxTrips = Math.max(...stations.map((station) => station.trips), 1);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): number {
  let t = (hashString(seed) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

export function isValidHour(value: string): boolean {
  const hour = Number(value);
  return value !== '' && Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

export function predictCounts(station: StationInfo, date: string, hour: number): BikeCounts {
  const seed = `${station.id}|${date}|${hour}`;
  const popularity = 0.4 + 0.6 * (station.trips / maxTrips);
  const jitter = 0.7 + 0.6 * seededRandom(seed);
  const total = Math.round(MAX_BIKES_PER_STATION * popularity * HOURLY_CURVE[hour] * jitter);
  const electric = Math.round(total * station.electricShare);
  const classic = total - electric;
  const spread = 0.15 + 0.15 * seededRandom(`${seed}|spread`);

  return {
    classic,
    classicLow: Math.max(0, Math.floor(classic * (1 - spread))),
    classicHigh: Math.ceil(classic * (1 + spread)),
    electric,
    electricLow: Math.max(0, Math.floor(electric * (1 - spread))),
    electricHigh: Math.ceil(electric * (1 + spread)),
  };
}

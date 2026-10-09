import type { NextRequest } from 'next/server';
import stationsData from '@/data/stations.json';
import type { PredictionsResponse, StationInfo } from '@/lib/types';

const stations = stationsData as StationInfo[];

const HOURLY_CURVE = [
  0.15, 0.1, 0.08, 0.06, 0.08, 0.2, 0.45, 0.85, 1.0, 0.75, 0.6, 0.65,
  0.75, 0.75, 0.7, 0.75, 0.9, 1.0, 0.95, 0.75, 0.55, 0.4, 0.3, 0.2,
];
const MAX_BIKES_PER_STATION = 40;

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

function predict(date: string, hour: number): PredictionsResponse {
  const maxTrips = Math.max(...stations.map((station) => station.trips), 1);

  return {
    date,
    hour,
    stations: stations.map((station) => {
      const popularity = 0.4 + 0.6 * (station.trips / maxTrips);
      const jitter = 0.7 + 0.6 * seededRandom(`${station.id}|${date}|${hour}`);
      const total = Math.round(MAX_BIKES_PER_STATION * popularity * HOURLY_CURVE[hour] * jitter);
      const electric = Math.round(total * station.electricShare);

      return {
        id: station.id,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        classic: total - electric,
        electric,
      };
    }),
  };
}

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') ?? '';
  const hourParam = searchParams.get('hour') ?? '';
  const hour = Number(hourParam);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (hourParam === '' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return Response.json({ error: 'hour must be an integer from 0 to 23' }, { status: 400 });
  }

  return Response.json(predict(date, hour));
}

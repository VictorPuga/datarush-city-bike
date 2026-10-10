import type { WeatherSource } from './types';

const LATITUDE = 40.73;
const LONGITUDE = -73.99;
const DAY_MS = 86_400_000;
const FORECAST_PAST_DAYS = 90;
const FORECAST_AHEAD_DAYS = 15;
const FAILURE_TTL_MS = 5 * 60_000;
const DEFAULT_HOUR = [18, 60, 10, 0, 0, 0];

export type DayWeather = {
  source: WeatherSource;
  hours: number[][];
};

const cache = new Map<string, { value: Promise<DayWeather>; expires: number }>();

function defaultWeather(): DayWeather {
  return { source: 'default', hours: Array.from({ length: 24 }, () => DEFAULT_HOUR) };
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

async function fetchWeather(date: string): Promise<DayWeather> {
  const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.now()) / DAY_MS);
  if (offset > FORECAST_AHEAD_DAYS) return defaultWeather();

  const host = offset < -FORECAST_PAST_DAYS ? 'archive-api' : 'api';
  const path = offset < -FORECAST_PAST_DAYS ? 'archive' : 'forecast';
  const params = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code',
    start_date: shiftDate(date, -1),
    end_date: date,
    timezone: 'America/New_York',
  });
  const response = await fetch(`https://${host}.open-meteo.com/v1/${path}?${params}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const { hourly } = (await response.json()) as { hourly: Record<string, (number | null)[]> };

  const value = (key: string, index: number, fallback: number) => hourly[key]?.[index] ?? fallback;
  const precipitation = (index: number) => (index < 0 ? 0 : value('precipitation', index, 0));
  return {
    source: 'open-meteo',
    hours: Array.from({ length: 24 }, (_, hour) => {
      const index = 24 + hour;
      return [
        value('temperature_2m', index, DEFAULT_HOUR[0]),
        value('relative_humidity_2m', index, DEFAULT_HOUR[1]),
        value('wind_speed_10m', index, DEFAULT_HOUR[2]),
        precipitation(index),
        precipitation(index - 1) + precipitation(index - 2),
        value('weather_code', index, 0),
      ];
    }),
  };
}

export function getWeather(date: string): Promise<DayWeather> {
  const hit = cache.get(date);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = fetchWeather(date).catch(() => {
    cache.set(date, { value: Promise.resolve(defaultWeather()), expires: Date.now() + FAILURE_TTL_MS });
    return defaultWeather();
  });
  cache.set(date, { value, expires: Number.POSITIVE_INFINITY });
  return value;
}

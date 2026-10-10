import type { HourWeather, WeatherSource } from './types';

const LATITUDE = 40.73;
const LONGITUDE = -73.99;
const DAY_MS = 86_400_000;
const FORECAST_PAST_DAYS = 90;
const FORECAST_AHEAD_DAYS = 15;
const FAILURE_TTL_MS = 5 * 60_000;
const DEFAULT_SLOT = [18, 60, 10, 0, 0, 0];
const SLOTS = 96;
const HOURS = 72;
const HOURLY_VARIABLES = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'precipitation', 'weather_code'] as const;

export type HourlyWeather = Record<(typeof HOURLY_VARIABLES)[number], (number | null)[]>;

export type DayWeather = {
  source: WeatherSource;
  /** The `clima` input, 96 slots by 6 values. */
  clima: Float32Array;
};

const cache = new Map<string, { value: Promise<DayWeather>; expires: number }>();

function defaultWeather(): DayWeather {
  const clima = new Float32Array(SLOTS * 6);
  for (let slot = 0; slot < SLOTS; slot += 1) clima.set(DEFAULT_SLOT, slot * 6);
  return { source: 'default', clima };
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Fills the 72 hourly values (00:00 of the day before to 23:00 of the day after).
 * A missing or null value takes the previous valid one, or the next one at the start, so the gap is bridged with the nearest value.
 * Precipitation with no valid value anywhere is 0, and so is a weather code; the other variables then fall back to a mild default.
 */
function fillHours(values: (number | null)[] | undefined, fallback: number): number[] {
  const filled = Array.from({ length: HOURS }, (_, i) => {
    const value = values?.[i];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  });
  const first = filled.find((value) => value !== null) ?? fallback;
  let last = first;
  return filled.map((value) => {
    last = value ?? last;
    return last;
  });
}

/**
 * The `clima` input of a day from the hourly Open-Meteo values of the day before, the day and the day after.
 * As in training: temperature, humidity and wind are interpolated linearly to the 15-minute slot,
 * the rain of hour h is the value stamped h + 1 and the weather code is the one stamped h, both held for the four slots of the hour,
 * and `precip_prev2h` is the rain rate of the 8 previous slots divided by 4.
 */
export function climaFromHourly(hourly: HourlyWeather): Float32Array {
  const [temperature, humidity, wind, precipitation, code] = HOURLY_VARIABLES.map((key, k) =>
    fillHours(hourly[key], DEFAULT_SLOT[k]),
  );
  const rainRate = (slot: number) => precipitation[1 + (slot >> 2)];
  const clima = new Float32Array(SLOTS * 6);
  for (let slot = 0; slot < SLOTS; slot += 1) {
    const j = SLOTS + slot;
    const hour = j >> 2;
    const fraction = (j % 4) / 4;
    const smooth = (v: number[]) => v[hour] + fraction * (v[hour + 1] - v[hour]);
    let previous = 0;
    for (let k = j - 8; k < j; k += 1) previous += rainRate(k);
    clima.set([smooth(temperature), smooth(humidity), smooth(wind), rainRate(j), previous / 4, code[hour]], slot * 6);
  }
  return clima;
}

/** The conditions of each hour of the day, read from the `clima` slots at the start of the hour. */
export function hoursFromClima(clima: Float32Array): HourWeather[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const [temperature, humidity, wind, precipitation, , code] = clima.subarray(hour * 4 * 6, hour * 4 * 6 + 6);
    return {
      hour,
      temperature: Math.round(temperature * 10) / 10,
      humidity: Math.round(humidity),
      wind: Math.round(wind * 10) / 10,
      precipitation: Math.round(precipitation * 10) / 10,
      code: Math.round(code),
    };
  });
}

/** One retry after a failed request or a 429 or 5xx, since a whole week of days is requested at once. */
async function withRetry(send: () => Promise<Response>): Promise<Response> {
  const transient = (response: Response) => response.status === 429 || response.status >= 500;
  try {
    const response = await send();
    if (!transient(response)) return response;
  } catch {
    // retry below
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return send();
}

async function fetchWeather(date: string): Promise<DayWeather> {
  const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.now()) / DAY_MS);
  if (offset > FORECAST_AHEAD_DAYS) return defaultWeather();

  const host = offset < -FORECAST_PAST_DAYS ? 'archive-api' : 'api';
  const path = offset < -FORECAST_PAST_DAYS ? 'archive' : 'forecast';
  const request = async (endDate: string) => {
    const params = new URLSearchParams({
      latitude: String(LATITUDE),
      longitude: String(LONGITUDE),
      hourly: HOURLY_VARIABLES.join(','),
      start_date: shiftDate(date, -1),
      end_date: endDate,
      timezone: 'America/New_York',
    });
    return fetch(`https://${host}.open-meteo.com/v1/${path}?${params}`, { signal: AbortSignal.timeout(4000) });
  };
  let response = await withRetry(() => request(shiftDate(date, 1)));
  // On the last forecast day the day after is out of range and the request is refused.
  // Without it only 00:00 of the day after is missing, and `fillHours` repeats 23:00 in its place.
  if (response.status === 400) response = await withRetry(() => request(date));
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const { hourly } = (await response.json()) as { hourly: HourlyWeather };
  return { source: 'open-meteo', clima: climaFromHourly(hourly) };
}

export function getWeather(date: string): Promise<DayWeather> {
  const hit = cache.get(date);
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = fetchWeather(date).catch((error) => {
    console.warn(`Weather for ${date} unavailable, using defaults:`, error);
    cache.set(date, { value: Promise.resolve(defaultWeather()), expires: Date.now() + FAILURE_TTL_MS });
    return defaultWeather();
  });
  cache.set(date, { value, expires: Number.POSITIVE_INFINITY });
  return value;
}

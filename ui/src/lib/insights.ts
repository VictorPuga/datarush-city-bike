import { predictCounts, stations } from './mock';
import { regionIdOf } from './regions';
import type { DayTotals, RegionFlow } from './types';

const DAY_MS = 86_400_000;
const dayCache = new Map<string, DayTotals>();

export function weekDates(date: string): string[] {
  const base = new Date(`${date}T00:00:00Z`);
  const monday = base.getTime() - ((base.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

export function dayTotals(date: string): DayTotals {
  const cached = dayCache.get(date);
  if (cached) return cached;
  const hours = Array.from({ length: 24 }, () => ({ classic: 0, electric: 0 }));
  for (const station of stations) {
    for (let hour = 0; hour < 24; hour += 1) {
      const counts = predictCounts(station, date, hour);
      hours[hour].classic += counts.classic;
      hours[hour].electric += counts.electric;
    }
  }
  const totals = { date, hours };
  dayCache.set(date, totals);
  return totals;
}

export function netFlow(date: string, hour: number): RegionFlow[] {
  const next = (hour + 1) % 24;
  const flows = new Map<string, RegionFlow>();
  for (const station of stations) {
    const id = regionIdOf(station.id);
    if (!id) continue;
    const now = predictCounts(station, date, hour);
    const later = predictCounts(station, date, next);
    const flow = flows.get(id) ?? { id, classic: 0, electric: 0 };
    flow.classic += later.classic - now.classic;
    flow.electric += later.electric - now.electric;
    flows.set(id, flow);
  }
  return [...flows.values()];
}

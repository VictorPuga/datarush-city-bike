import { getForecast, modelStations, netChange } from './model';
import { regionIdOf } from './regions';
import { SLOTS_PER_DAY } from './time';
import type { CitySlot, DayTotals, RegionFlow } from './types';

const DAY_MS = 86_400_000;

export function weekDates(date: string): string[] {
  const base = new Date(`${date}T00:00:00Z`);
  const monday = base.getTime() - ((base.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

export async function dayTotals(date: string): Promise<DayTotals> {
  const [forecast, stations] = await Promise.all([getForecast(date), modelStations()]);
  const slots: CitySlot[] = Array.from({ length: SLOTS_PER_DAY }, () => ({
    classic: 0,
    electric: 0,
    depClassic: 0,
    depElectric: 0,
  }));
  for (const { index } of stations) {
    const base = index * SLOTS_PER_DAY;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const total = slots[slot];
      total.classic += forecast.stockClassic[base + slot];
      total.electric += forecast.stockElectric[base + slot];
      total.depClassic += forecast.depClassic[base + slot];
      total.depElectric += forecast.depElectric[base + slot];
    }
  }
  for (const total of slots) {
    total.classic = Math.round(total.classic);
    total.electric = Math.round(total.electric);
    total.depClassic = Math.round(total.depClassic * 10) / 10;
    total.depElectric = Math.round(total.depElectric * 10) / 10;
  }
  return { date, slots };
}

export async function netFlow(date: string, slot: number): Promise<RegionFlow[]> {
  const [forecast, stations] = await Promise.all([getForecast(date), modelStations()]);
  const flows = new Map<string, RegionFlow>();
  for (const { id, index } of stations) {
    const region = regionIdOf(id);
    if (!region) continue;
    const change = netChange(forecast, index, slot);
    const flow = flows.get(region) ?? { id: region, classic: 0, electric: 0 };
    flow.classic += change.classic;
    flow.electric += change.electric;
    flows.set(region, flow);
  }
  return [...flows.values()].map((flow) => ({
    id: flow.id,
    classic: Math.round(flow.classic * 10) / 10,
    electric: Math.round(flow.electric * 10) / 10,
  }));
}

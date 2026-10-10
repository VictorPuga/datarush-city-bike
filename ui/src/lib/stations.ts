import stationsData from '@/data/stations.json';
import { SLOTS_PER_DAY } from './time';
import type { StationInfo } from './types';

export const stations = stationsData as StationInfo[];

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

export function isValidSlot(value: string): boolean {
  const slot = Number(value);
  return value !== '' && Number.isInteger(slot) && slot >= 0 && slot < SLOTS_PER_DAY;
}

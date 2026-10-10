import type { Layer, StationPrediction } from './types';

export const MAX_BIKES = 40;

export const RAMP = ['#ffe08a', '#f59e0b', '#e4572e', '#8b1e3f'];

const BASE_RADIUS_METERS = 40;
const RADIUS_PER_SQRT_BIKE = 25;

export function layerValue(station: StationPrediction, layer: Layer): number {
  if (layer === 'classic') return station.classic;
  if (layer === 'electric') return station.electric;
  return station.classic + station.electric;
}

export function radiusFor(value: number): number {
  return BASE_RADIUS_METERS + RADIUS_PER_SQRT_BIKE * Math.sqrt(value);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorFor(value: number): string {
  const t = Math.min(Math.max(value / MAX_BIKES, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(t), RAMP.length - 2);
  const from = hexToRgb(RAMP[i]);
  const to = hexToRgb(RAMP[i + 1]);
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * (t - i)));
  return `rgb(${r}, ${g}, ${b})`;
}

export const CLASSIC_COLOR = '#2563eb';
export const ELECTRIC_COLOR = '#16a34a';

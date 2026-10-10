import type { BikeCounts, Layer } from './types';

export const MAX_BIKES = 40;

export const RAMP = ['#ffd60a', '#ff9f0a', '#ff3b30', '#a1122a'];

export function layerValue(station: Pick<BikeCounts, 'classic' | 'electric'>, layer: Layer): number {
  if (layer === 'classic') return station.classic;
  if (layer === 'electric') return station.electric;
  return station.classic + station.electric;
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

export const CLASSIC_COLOR = '#007aff';
export const ELECTRIC_COLOR = '#34c759';

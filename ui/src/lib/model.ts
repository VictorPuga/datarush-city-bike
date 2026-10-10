import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { isHoliday, modelWeekday } from './calendar';
import { stations as knownStations } from './stations';
import { SLOTS_PER_DAY } from './time';
import type { BikeCounts, WeatherSource } from './types';
import { getWeather } from './weather';

const MODELS_DIR = process.env.MODELS_DIR ?? path.join(process.cwd(), 'models');
const MODEL_PATH = path.join(MODELS_DIR, 'demanda_net_v2.onnx');
const IDS_PATH = path.join(MODELS_DIR, 'station_ids.json');

const POPULARITY_SHARE = 0.05;
const Z_80 = 1.28;
const CACHE_SIZE = 8;
const CHANNELS = 4;
const [DEP_CLASSIC, DEP_ELECTRIC, ARR_CLASSIC, ARR_ELECTRIC] = [0, 1, 2, 3];

type Series = Float32Array;

export type DayForecast = {
  date: string;
  weather: WeatherSource;
  stockClassic: Series;
  stockElectric: Series;
  sigmaClassic: Series;
  sigmaElectric: Series;
  depClassic: Series;
  depElectric: Series;
  arrClassic: Series;
  arrElectric: Series;
};

export type ModelStation = { id: string; index: number };

let runtime: Promise<{ session: InferenceSession; indexById: Map<string, number> }> | undefined;
const forecasts = new Map<string, Promise<DayForecast>>();

function load() {
  runtime ??= (async () => {
    if (!existsSync(MODEL_PATH) || !existsSync(IDS_PATH)) {
      throw new Error(`Model files not found in ${MODELS_DIR}`);
    }
    const ids = JSON.parse(readFileSync(IDS_PATH, 'utf8')) as string[];
    const session = await InferenceSession.create(MODEL_PATH);
    return { session, indexById: new Map(ids.map((id, index) => [id, index])) };
  })();
  runtime.catch(() => {
    runtime = undefined;
  });
  return runtime;
}

export async function modelStations(): Promise<ModelStation[]> {
  const { indexById } = await load();
  return knownStations.flatMap((station) => {
    const index = indexById.get(station.id);
    return index === undefined ? [] : [{ id: station.id, index }];
  });
}

async function compute(date: string): Promise<DayForecast> {
  const { session, indexById } = await load();
  const total = indexById.size;
  const weather = await getWeather(date);

  const slots = Array.from({ length: SLOTS_PER_DAY }, (_, slot) => slot);
  const clima = new Float32Array(SLOTS_PER_DAY * 6);
  slots.forEach((slot) => clima.set(weather.hours[Math.floor(slot / 4)], slot * 6));

  const results = await session.run({
    slot_dia: new Tensor('int64', BigInt64Array.from(slots.map(BigInt)), [SLOTS_PER_DAY]),
    dia_semana: new Tensor('int64', new BigInt64Array(SLOTS_PER_DAY).fill(BigInt(modelWeekday(date))), [
      SLOTS_PER_DAY,
    ]),
    es_festivo: new Tensor('float32', new Float32Array(SLOTS_PER_DAY).fill(isHoliday(date) ? 1 : 0), [
      SLOTS_PER_DAY,
    ]),
    clima: new Tensor('float32', clima, [SLOTS_PER_DAY, 6]),
  });
  const lambda = results.lambda.data as Float32Array;
  const at = (slot: number, station: number, channel: number) =>
    lambda[(slot * total + station) * CHANNELS + channel];

  const size = total * SLOTS_PER_DAY;
  const forecast: DayForecast = {
    date,
    weather: weather.source,
    stockClassic: new Float32Array(size),
    stockElectric: new Float32Array(size),
    sigmaClassic: new Float32Array(size),
    sigmaElectric: new Float32Array(size),
    depClassic: new Float32Array(size),
    depElectric: new Float32Array(size),
    arrClassic: new Float32Array(size),
    arrElectric: new Float32Array(size),
  };

  for (let station = 0; station < total; station += 1) {
    const base = station * SLOTS_PER_DAY;
    for (const [dep, arr, stock, sigma, depOut, arrOut] of [
      [DEP_CLASSIC, ARR_CLASSIC, forecast.stockClassic, forecast.sigmaClassic, forecast.depClassic, forecast.arrClassic],
      [DEP_ELECTRIC, ARR_ELECTRIC, forecast.stockElectric, forecast.sigmaElectric, forecast.depElectric, forecast.arrElectric],
    ] as const) {
      let net = 0;
      let variance = 0;
      let lowest = 0;
      let departures = 0;
      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
        const out = at(slot, station, dep);
        const inbound = at(slot, station, arr);
        stock[base + slot] = net;
        sigma[base + slot] = Math.sqrt(variance);
        depOut[base + slot] = out;
        arrOut[base + slot] = inbound;
        lowest = Math.min(lowest, net);
        net += inbound - out;
        variance += inbound + out;
        departures += out;
      }
      const baseline = Math.ceil(-lowest) + Math.round(POPULARITY_SHARE * departures);
      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) stock[base + slot] += baseline;
    }
  }
  return forecast;
}

export function getForecast(date: string): Promise<DayForecast> {
  let hit = forecasts.get(date);
  if (hit) {
    forecasts.delete(date);
  } else {
    hit = compute(date);
    hit.catch(() => forecasts.delete(date));
    if (forecasts.size >= CACHE_SIZE) forecasts.delete(forecasts.keys().next().value as string);
  }
  forecasts.set(date, hit);
  return hit;
}

function band(value: number, sigma: number): [number, number, number] {
  const spread = Z_80 * sigma;
  return [Math.round(value), Math.max(0, Math.floor(value - spread)), Math.ceil(value + spread)];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function stockCounts(forecast: DayForecast, station: number, slot: number): BikeCounts {
  const i = station * SLOTS_PER_DAY + slot;
  const [classic, classicLow, classicHigh] = band(forecast.stockClassic[i], forecast.sigmaClassic[i]);
  const [electric, electricLow, electricHigh] = band(forecast.stockElectric[i], forecast.sigmaElectric[i]);
  return { classic, classicLow, classicHigh, electric, electricLow, electricHigh };
}

export function departureCounts(forecast: DayForecast, station: number, slot: number): BikeCounts {
  const i = station * SLOTS_PER_DAY + slot;
  const counts = (value: number) => {
    const spread = Z_80 * Math.sqrt(value);
    return [round1(value), round1(Math.max(0, value - spread)), round1(value + spread)] as const;
  };
  const [classic, classicLow, classicHigh] = counts(forecast.depClassic[i]);
  const [electric, electricLow, electricHigh] = counts(forecast.depElectric[i]);
  return { classic, classicLow, classicHigh, electric, electricLow, electricHigh };
}

export function netChange(forecast: DayForecast, station: number, slot: number) {
  const i = station * SLOTS_PER_DAY + slot;
  return {
    classic: forecast.arrClassic[i] - forecast.depClassic[i],
    electric: forecast.arrElectric[i] - forecast.depElectric[i],
  };
}

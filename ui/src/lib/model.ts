import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { isHoliday, modelWeekday } from './calendar';
import {
  type Shocks,
  flowBand,
  groupFlowBand,
  groupSlot,
  groupStock,
  round1,
  shockTerms,
  stationStock,
  stockBand,
} from './intervals';
import { regionIdOf, regionShapes } from './regions';
import { stations as knownStations } from './stations';
import { SLOTS_PER_DAY } from './time';
import type { BikeCounts, RegionPrediction, WeatherSource } from './types';
import { type DayWeather, getWeather } from './weather';

const MODELS_DIR = process.env.MODELS_DIR ?? path.join(process.cwd(), 'models');
const MODEL_PATH = path.join(MODELS_DIR, 'demanda_net_v3.onnx');
const META_PATH = path.join(MODELS_DIR, 'estaciones_onnx_v3.json');

const CACHE_SIZE = 8;
const CHANNELS = 4;
const [DEP_CLASSIC, DEP_ELECTRIC, ARR_CLASSIC, ARR_ELECTRIC] = [0, 1, 2, 3];
const BIKES = [
  { dep: DEP_CLASSIC, arr: ARR_CLASSIC, shocks: 'classic' },
  { dep: DEP_ELECTRIC, arr: ARR_ELECTRIC, shocks: 'electric' },
] as const;

type Series = Float32Array;
type Stats = Float64Array;

export type DayForecast = {
  date: string;
  weather: WeatherSource;
  /** Expected bikes per 15 minutes and negative binomial dispersion, one series per channel, at `station * 96 + slot`. */
  lambda: Series[];
  alpha: Series[];
  /** Expected stock and its standard deviation, classic then electric, at `station * 96 + slot`. */
  stock: Stats[];
  sigma: Stats[];
  /** The same per neighbourhood of `regionShapes`, at `region * 96 + slot`. */
  regionStock: Stats[];
  regionSigma: Stats[];
};

export type ModelStation = { id: string; index: number };

type ModelMeta = {
  stations: { station_id: string; active: boolean }[];
  intervals: { shocks: Shocks };
};

type Runtime = {
  session: InferenceSession;
  total: number;
  covered: ModelStation[];
  shocks: Shocks;
  members: number[][];
};

let runtime: Promise<Runtime> | undefined;
const forecasts = new Map<string, Promise<DayForecast>>();

function load() {
  runtime ??= (async () => {
    if (!existsSync(MODEL_PATH) || !existsSync(META_PATH)) {
      throw new Error(`Model files not found in ${MODELS_DIR}`);
    }
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as ModelMeta;
    const session = await InferenceSession.create(MODEL_PATH);
    const modelIndex = new Map(meta.stations.map((station, index) => [station.station_id, { index, active: station.active }]));
    const covered = knownStations.flatMap((station) => {
      const entry = modelIndex.get(station.id);
      return entry?.active ? [{ id: station.id, index: entry.index }] : [];
    });
    const regionPosition = new Map(regionShapes.map((shape, position) => [shape.id, position]));
    const members: number[][] = regionShapes.map(() => []);
    for (const { id, index } of covered) {
      const position = regionPosition.get(regionIdOf(id) ?? '');
      if (position !== undefined) members[position].push(index);
    }
    return { session, total: meta.stations.length, covered, shocks: meta.intervals.shocks, members };
  })();
  runtime.catch(() => {
    runtime = undefined;
  });
  return runtime;
}

/** Stations of `stations.json` that the model forecasts and that were active in its last weeks. */
export async function modelStations(): Promise<ModelStation[]> {
  return (await load()).covered;
}

/** Runs the model for one day with the given weather. */
export async function computeForecast(date: string, weather: DayWeather): Promise<DayForecast> {
  const { session, total, covered, shocks, members } = await load();

  const slots = Array.from({ length: SLOTS_PER_DAY }, (_, slot) => slot);
  const results = await session.run({
    slot_dia: new Tensor('int64', BigInt64Array.from(slots.map(BigInt)), [SLOTS_PER_DAY]),
    dia_semana: new Tensor('int64', new BigInt64Array(SLOTS_PER_DAY).fill(BigInt(modelWeekday(date))), [
      SLOTS_PER_DAY,
    ]),
    es_festivo: new Tensor('float32', new Float32Array(SLOTS_PER_DAY).fill(isHoliday(date) ? 1 : 0), [
      SLOTS_PER_DAY,
    ]),
    clima: new Tensor('float32', weather.clima, [SLOTS_PER_DAY, 6]),
  });
  const output = { lambda: results.lambda.data as Float32Array, alpha: results.alpha.data as Float32Array };

  const size = total * SLOTS_PER_DAY;
  const channels = (data: Float32Array) =>
    Array.from({ length: CHANNELS }, (_, channel) => {
      const series = new Float32Array(size);
      for (let station = 0; station < total; station += 1) {
        for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
          series[station * SLOTS_PER_DAY + slot] = data[(slot * total + station) * CHANNELS + channel];
        }
      }
      return series;
    });
  const lambda = channels(output.lambda);
  const alpha = channels(output.alpha);

  const regionSize = regionShapes.length * SLOTS_PER_DAY;
  const forecast: DayForecast = {
    date,
    weather: weather.source,
    lambda,
    alpha,
    stock: BIKES.map(() => new Float64Array(size)),
    sigma: BIKES.map(() => new Float64Array(size)),
    regionStock: BIKES.map(() => new Float64Array(regionSize)),
    regionSigma: BIKES.map(() => new Float64Array(regionSize)),
  };

  BIKES.forEach(({ dep, arr, shocks: bike }, b) => {
    const terms = shockTerms(shocks[bike]);
    const series = { departures: lambda[dep], arrivals: lambda[arr], alphaDepartures: alpha[dep], alphaArrivals: alpha[arr] };
    const baselines = new Map<number, number>();
    for (const { index } of covered) {
      const base = index * SLOTS_PER_DAY;
      const result = stationStock(series, terms, SLOTS_PER_DAY, (slot) => base + slot);
      baselines.set(index, result.baseline);
      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
        forecast.stock[b][base + slot] = result.baseline + result.net[slot];
        forecast.sigma[b][base + slot] = result.sigma[slot];
      }
    }
    members.forEach((stationsOf, region) => {
      if (stationsOf.length === 0) return;
      const baseline = stationsOf.reduce((sum, index) => sum + baselines.get(index)!, 0);
      const result = groupStock(stationsOf.length, series, terms, SLOTS_PER_DAY, (member, slot) => stationsOf[member] * SLOTS_PER_DAY + slot);
      for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
        forecast.regionStock[b][region * SLOTS_PER_DAY + slot] = baseline + result.net[slot];
        forecast.regionSigma[b][region * SLOTS_PER_DAY + slot] = result.sigma[slot];
      }
    });
  });
  return forecast;
}

export function getForecast(date: string): Promise<DayForecast> {
  let hit = forecasts.get(date);
  if (hit) {
    forecasts.delete(date);
  } else {
    hit = getWeather(date).then((weather) => computeForecast(date, weather));
    hit.catch(() => forecasts.delete(date));
    if (forecasts.size >= CACHE_SIZE) forecasts.delete(forecasts.keys().next().value as string);
  }
  forecasts.set(date, hit);
  return hit;
}

function pair(classic: readonly [number, number, number], electric: readonly [number, number, number]): BikeCounts {
  return {
    classic: classic[0],
    classicLow: classic[1],
    classicHigh: classic[2],
    electric: electric[0],
    electricLow: electric[1],
    electricHigh: electric[2],
  };
}

export function stockCounts(forecast: DayForecast, station: number, slot: number): BikeCounts {
  const i = station * SLOTS_PER_DAY + slot;
  return pair(stockBand(forecast.stock[0][i], forecast.sigma[0][i]), stockBand(forecast.stock[1][i], forecast.sigma[1][i]));
}

function flowCounts(forecast: DayForecast, channels: readonly [number, number], station: number, slot: number): BikeCounts {
  const i = station * SLOTS_PER_DAY + slot;
  const [classic, electric] = channels.map((channel) => flowBand(forecast.lambda[channel][i], forecast.alpha[channel][i]));
  return pair(classic as [number, number, number], electric as [number, number, number]);
}

export function departureCounts(forecast: DayForecast, station: number, slot: number): BikeCounts {
  return flowCounts(forecast, [DEP_CLASSIC, DEP_ELECTRIC], station, slot);
}

export function arrivalCounts(forecast: DayForecast, station: number, slot: number): BikeCounts {
  return flowCounts(forecast, [ARR_CLASSIC, ARR_ELECTRIC], station, slot);
}

export function netChange(forecast: DayForecast, station: number, slot: number) {
  const i = station * SLOTS_PER_DAY + slot;
  return {
    classic: forecast.lambda[ARR_CLASSIC][i] - forecast.lambda[DEP_CLASSIC][i],
    electric: forecast.lambda[ARR_ELECTRIC][i] - forecast.lambda[DEP_ELECTRIC][i],
  };
}

/** Position of a neighbourhood in `regionShapes`, the order of the region series. */
export function regionPosition(regionId: string): number {
  return regionShapes.findIndex((shape) => shape.id === regionId);
}

function flowOf(model: Runtime, forecast: DayForecast, region: number, kind: 'departures' | 'arrivals', bike: 0 | 1, slot: number) {
  const channel = BIKES[bike][kind === 'departures' ? 'dep' : 'arr'];
  const stationsOf = model.members[region];
  const lambdas = stationsOf.map((index) => forecast.lambda[channel][index * SLOTS_PER_DAY + slot]);
  const alphas = stationsOf.map((index) => forecast.alpha[channel][index * SLOTS_PER_DAY + slot]);
  return groupSlot(lambdas, alphas, shockTerms(model.shocks[BIKES[bike].shocks]));
}

/** Mean and standard deviation of the departures or arrivals of the active stations of a neighbourhood in one slot. */
export async function regionFlow(forecast: DayForecast, region: number, kind: 'departures' | 'arrivals', bike: 0 | 1, slot: number) {
  return flowOf(await load(), forecast, region, kind, bike, slot);
}

/** Every neighbourhood with its stock, departures and arrivals in one slot, with bounds from the variance of the sum. */
export async function regionPredictions(forecast: DayForecast, slot: number): Promise<RegionPrediction[]> {
  const model = await load();
  const zero = [0, 0, 0] as const;
  const flows = (region: number, kind: 'departures' | 'arrivals'): BikeCounts => {
    const [classic, electric] = ([0, 1] as const).map((bike) => {
      const { mean, sd } = flowOf(model, forecast, region, kind, bike, slot);
      const [low, high] = groupFlowBand(mean, sd);
      return [round1(mean), low, high] as const;
    });
    return pair(classic, electric);
  };
  return regionShapes.map((shape, region) => {
    const i = region * SLOTS_PER_DAY + slot;
    const empty = model.members[region].length === 0;
    return {
      id: shape.id,
      name: shape.name,
      borough: shape.borough,
      lat: shape.lat,
      lon: shape.lon,
      stations: model.members[region].length,
      ...(empty
        ? pair(zero, zero)
        : pair(
            stockBand(forecast.regionStock[0][i], forecast.regionSigma[0][i]),
            stockBand(forecast.regionStock[1][i], forecast.regionSigma[1][i]),
          )),
      departures: empty ? pair(zero, zero) : flows(region, 'departures'),
      arrivals: empty ? pair(zero, zero) : flows(region, 'arrivals'),
    };
  });
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isHoliday, modelWeekday } from '../src/lib/calendar.ts';
import {
  type DayForecast,
  arrivalCounts,
  computeForecast,
  departureCounts,
  modelStations,
  regionFlow,
  regionPosition,
  regionPredictions,
  stockCounts,
} from '../src/lib/model.ts';
import type { BikeCounts } from '../src/lib/types.ts';
import { type HourlyWeather, climaFromHourly } from '../src/lib/weather.ts';

const FIXTURE = path.join(process.cwd(), '..', 'data', 'results', 'ui_reference_v3.json');
const SLOTS = 96;
const BOUNDARY = 1e-6;
const BIKES = ['classic', 'electric'] as const;
const CHANNELS = { classic: [0, 2], electric: [1, 3] } as const;

type Band = [number, number, number];
type Flow = { mean: number[]; sd: number[]; band: [number, number][] };
type StationBike = { stock: number[]; sigma: number[]; stock_band: Band[]; departures: Band[]; arrivals: Band[] };
type RegionBike = { stock: number[]; sigma: number[]; stock_band: Band[]; departures: Flow; arrivals: Flow };
type Fixture = {
  date: string;
  weekday: number;
  holiday: number;
  hourly: HourlyWeather;
  clima: number[][];
  stations: Record<
    string,
    { active: boolean; index: number; lambda: number[][]; alpha: number[][]; bikes: Record<string, StationBike> }
  >;
  regions: Record<string, { stations: string[]; bikes: Record<string, RegionBike> }>;
};

const worst = new Map<string, { diff: number; limit: number; where: string }>();
const notes: string[] = [];

function track(quantity: string, diff: number, limit: number, where: string) {
  const previous = worst.get(quantity);
  if (!previous || Number.isNaN(diff) || diff / limit > previous.diff / previous.limit) {
    worst.set(quantity, { diff, limit, where });
  }
}

/** An integer bound must be identical, except for a difference of 1 within BOUNDARY of the rounding boundary. */
function bound(quantity: string, actual: number, expected: number, where: string, margin: number) {
  track(quantity, 0, 1, where);
  if (actual === expected) return;
  const boundary = margin < BOUNDARY && Math.abs(actual - expected) === 1;
  notes.push(`${quantity} ${where}: got ${actual}, expected ${expected}, margin ${margin.toExponential(1)}${boundary ? ' (accepted)' : ''}`);
  if (!boundary) track(quantity, Math.abs(actual - expected), 1, where);
}

function nbCdf(mu: number, alpha: number, k: number) {
  const r = 1 / Math.max(alpha, 1e-4);
  const odds = mu / (r + mu);
  let pmf = Math.exp(r * Math.log(r / (r + mu)));
  let cdf = pmf;
  for (let i = 0; i < k; i += 1) {
    pmf *= ((i + r) / (i + 1)) * odds;
    cdf += pmf;
  }
  return cdf;
}

const quantileMargin = (mu: number, alpha: number, k: number, q: number) =>
  Math.min(Math.abs(nbCdf(mu, alpha, k) - q), Math.abs(nbCdf(mu, alpha, Math.max(k - 1, 0)) - q));

const distanceToInteger = (x: number) => Math.abs(x - Math.round(x));

function stockMargins(value: number, sigma: number): Band {
  const spread = 1.28 * sigma;
  return [Math.abs(value - Math.floor(value) - 0.5), distanceToInteger(value - spread), distanceToInteger(value + spread)];
}

const bandOf = (counts: BikeCounts, bike: (typeof BIKES)[number]): Band =>
  bike === 'classic'
    ? [counts.classic, counts.classicLow, counts.classicHigh]
    : [counts.electric, counts.electricLow, counts.electricHigh];

function checkLambda(forecast: DayForecast, index: number, entry: Fixture['stations'][string], where: string) {
  for (let slot = 0; slot < SLOTS; slot += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      for (const [name, series, expected] of [
        ['lambda', forecast.lambda, entry.lambda],
        ['alpha', forecast.alpha, entry.alpha],
      ] as const) {
        const target = expected[slot][channel];
        const diff = Math.abs(series[channel][index * SLOTS + slot] - target);
        const at = `${where} slot ${slot} channel ${channel}`;
        track(`${name} (|diff| <= 1e-4 * value + 1e-6)`, diff, 1e-4 * Math.abs(target) + 1e-6, at);
        if (Math.abs(target) >= 1e-2) track(`${name} (relative, values >= 0.01)`, diff / Math.abs(target), 1e-4, at);
      }
    }
  }
}

function checkStation(forecast: DayForecast, entry: Fixture['stations'][string], where: string) {
  for (let slot = 0; slot < SLOTS; slot += 1) {
    const i = entry.index * SLOTS + slot;
    const stock = stockCounts(forecast, entry.index, slot);
    const flows = {
      departures: departureCounts(forecast, entry.index, slot),
      arrivals: arrivalCounts(forecast, entry.index, slot),
    };
    BIKES.forEach((bike, b) => {
      const expected = entry.bikes[bike];
      const at = `${where} ${bike} slot ${slot}`;
      track('stock mean', Math.abs(forecast.stock[b][i] - expected.stock[slot]), 1e-3, at);
      track('stock sigma', Math.abs(forecast.sigma[b][i] - expected.sigma[slot]), 1e-3, at);
      const margins = stockMargins(expected.stock[slot], expected.sigma[slot]);
      bandOf(stock, bike).forEach((value, k) => bound('stock band (integer)', value, expected.stock_band[slot][k], at, margins[k]));
      CHANNELS[bike].forEach((channel, k) => {
        const kind = k === 0 ? 'departures' : 'arrivals';
        const got = bandOf(flows[kind], bike);
        const target = expected[kind][slot];
        track(`${kind} mean (one decimal)`, Math.abs(got[0] - target[0]), 1e-9, at);
        const mu = forecast.lambda[channel][i];
        const alpha = forecast.alpha[channel][i];
        bound(`${kind} 10% bound (integer)`, got[1], target[1], at, quantileMargin(mu, alpha, target[1], 0.1));
        bound(`${kind} 90% bound (integer)`, got[2], target[2], at, quantileMargin(mu, alpha, target[2], 0.9));
      });
    });
  }
}

async function checkRegion(forecast: DayForecast, regionId: string, entry: Fixture['regions'][string], day: string) {
  const region = regionPosition(regionId);
  for (let slot = 0; slot < SLOTS; slot += 1) {
    const predicted = (await regionPredictions(forecast, slot))[region];
    track('region station count', Math.abs(predicted.stations - entry.stations.length), 1, `${day} ${regionId}`);
    for (const [b, bike] of ([[0, 'classic'], [1, 'electric']] as const)) {
      const expected = entry.bikes[bike];
      const at = `${day} ${regionId} ${bike} slot ${slot}`;
      const i = region * SLOTS + slot;
      track('region stock mean', Math.abs(forecast.regionStock[b][i] - expected.stock[slot]), 1e-3, at);
      track('region stock sigma', Math.abs(forecast.regionSigma[b][i] - expected.sigma[slot]), 1e-3, at);
      const margins = stockMargins(expected.stock[slot], expected.sigma[slot]);
      bandOf(predicted, bike).forEach((value, k) =>
        bound('region stock band (integer)', value, expected.stock_band[slot][k], at, margins[k]),
      );
      for (const kind of ['departures', 'arrivals'] as const) {
        const { mean, sd } = await regionFlow(forecast, region, kind, b, slot);
        track(`region ${kind} mean`, Math.abs(mean - expected[kind].mean[slot]), 1e-3, at);
        track(`region ${kind} sd`, Math.abs(sd - expected[kind].sd[slot]), 1e-3, at);
        const alpha = Math.max((sd * sd - mean) / Math.max(mean, 1e-9) ** 2, 1e-4);
        const got = bandOf(predicted[kind], bike);
        [0.1, 0.9].forEach((q, k) => {
          const target = expected[kind].band[slot][k];
          bound(`region ${kind} ${k === 0 ? '10' : '90'}% bound (integer)`, got[k + 1], target, at, quantileMargin(mean, alpha, target, q));
        });
      }
    }
  }
}

async function checkDay(fixture: Fixture) {
  const day = fixture.date;
  const clima = climaFromHourly(fixture.hourly);
  fixture.clima.forEach((row, slot) =>
    row.forEach((target, column) => track('clima', Math.abs(clima[slot * 6 + column] - target), 1e-4, `${day} slot ${slot} column ${column}`)),
  );
  track('weekday', Math.abs(modelWeekday(day) - fixture.weekday), 1, day);
  track('holiday', Math.abs(Number(isHoliday(day)) - fixture.holiday), 1, day);

  const forecast = await computeForecast(day, { source: 'open-meteo', clima });
  const covered = new Map((await modelStations()).map((station) => [station.id, station.index]));
  for (const [id, entry] of Object.entries(fixture.stations)) {
    const where = `${day} ${id}`;
    if (!entry.active) {
      track('inactive station excluded', covered.has(id) ? 1 : 0, 1, where);
      continue;
    }
    track('station model index', Math.abs((covered.get(id) ?? -1) - entry.index), 1, where);
    checkLambda(forecast, entry.index, entry, where);
    checkStation(forecast, entry, where);
  }
  for (const [regionId, entry] of Object.entries(fixture.regions)) await checkRegion(forecast, regionId, entry, day);
}

const { days } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { days: Fixture[] };
for (const day of days) await checkDay(day);

let failed = false;
console.log('quantity'.padEnd(46), 'largest difference'.padEnd(20), 'limit'.padEnd(9), 'where');
for (const [quantity, { diff, limit, where }] of [...worst].sort(([a], [b]) => a.localeCompare(b))) {
  const ok = diff <= limit;
  failed ||= !ok;
  console.log(quantity.padEnd(46), diff.toExponential(2).padEnd(20), limit.toExponential(0).padEnd(9), ok ? 'ok' : `FAIL at ${where}`);
}
console.log(`\nInteger bounds that differ: ${notes.length}`);
for (const note of notes) console.log(`  ${note}`);
console.log(failed ? '\nFAILED' : '\nPASSED');
process.exit(failed ? 1 : 0);

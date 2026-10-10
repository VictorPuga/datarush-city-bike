export const Z_80 = 1.28;
export const POPULARITY_SHARE = 0.05;
export const ALPHA_FLOOR = 0.01;

export type BikeShocks = { D: number; H: number; R: number; Ds: number; Hs: number };
export type Shocks = { classic: BikeShocks; electric: BikeShocks };

export type ShockTerms = BikeShocks & { total: number; day: number; hour: number };

export function shockTerms(shocks: BikeShocks): ShockTerms {
  return {
    ...shocks,
    total: shocks.D + shocks.H + shocks.R + shocks.Ds + shocks.Hs,
    day: shocks.D + shocks.R + shocks.Ds,
    hour: shocks.H + shocks.Hs,
  };
}

export const idiosyncraticAlpha = (alpha: number, terms: Pick<ShockTerms, 'total'>) =>
  Math.max(alpha - terms.total, ALPHA_FLOOR);

/** Smallest k with P(Y <= k) >= q for a negative binomial with mean mu and variance mu + alpha mu^2. */
export function nbQuantile(mu: number, alpha: number, q: number): number {
  if (mu < 1e-9) return 0;
  const r = 1 / Math.max(alpha, 1e-4);
  const odds = mu / (r + mu);
  let pmf = Math.exp(r * Math.log(r / (r + mu)));
  let cdf = pmf;
  let k = 0;
  const limit = Math.trunc(mu + 12 * Math.sqrt(mu + alpha * mu * mu) + 50);
  while (cdf < q - 1e-12 && k < limit) {
    pmf *= ((k + r) / (k + 1)) * odds;
    k += 1;
    cdf += pmf;
  }
  return k;
}

export const round1 = (value: number) => Math.round(value * 10) / 10;

/** Mean (one decimal), 10% and 90% quantiles of one cell. */
export function flowBand(mean: number, alpha: number): [number, number, number] {
  return [round1(mean), nbQuantile(mean, alpha, 0.1), nbQuantile(mean, alpha, 0.9)];
}

/** Rounded value and the 80% band, floored at 0 bikes. */
export function stockBand(value: number, sigma: number): [number, number, number] {
  const spread = Z_80 * sigma;
  return [Math.round(value), Math.max(0, Math.floor(value - spread)), Math.ceil(value + spread)];
}

/** Quantiles of the departures or arrivals of a group: the negative binomial with that mean and standard deviation. */
export function groupFlowBand(mean: number, sd: number): [number, number] {
  const alpha = Math.max((sd * sd - mean) / Math.max(mean, 1e-9) ** 2, 1e-4);
  return [nbQuantile(mean, alpha, 0.1), nbQuantile(mean, alpha, 0.9)];
}

/** Mean and standard deviation of the departures or arrivals of stations in one slot. */
export function groupSlot(lambdas: ArrayLike<number>, alphas: ArrayLike<number>, terms: ShockTerms) {
  let mean = 0;
  let squares = 0;
  let noise = 0;
  for (let i = 0; i < lambdas.length; i += 1) {
    const lambda = lambdas[i];
    mean += lambda;
    squares += lambda * lambda;
    noise += lambda + idiosyncraticAlpha(alphas[i], terms) * lambda * lambda;
  }
  const variance = noise + (terms.D + terms.H + terms.R) * mean * mean + (terms.Ds + terms.Hs) * squares;
  return { mean, sd: Math.sqrt(variance) };
}

export type FlowSeries = {
  departures: ArrayLike<number>;
  arrivals: ArrayLike<number>;
  alphaDepartures: ArrayLike<number>;
  alphaArrivals: ArrayLike<number>;
};

export type StockSeries = {
  /** Net change since 00:00 at the start of each slot. */
  net: Float64Array;
  sigma: Float64Array;
  /** Bikes needed so the stock never drops below 0, plus 5% of the departures of the day. */
  baseline: number;
};

/**
 * Cumulative net change since midnight and its standard deviation for one station and bike type.
 * Variance: noise + (D + R + Ds) * M^2 + (H + Hs) * sum over hours of M_h^2.
 * `at(slot)` is the index of the slot in the four series.
 */
export function stationStock(
  { departures, arrivals, alphaDepartures, alphaArrivals }: FlowSeries,
  terms: ShockTerms,
  slots: number,
  at: (slot: number) => number,
): StockSeries {
  const net = new Float64Array(slots);
  const sigma = new Float64Array(slots);
  const perHour = new Float64Array(slots / 4);
  let cumulative = 0;
  let noise = 0;
  let hourSquares = 0;
  let lowest = 0;
  let totalDepartures = 0;
  for (let slot = 0; slot < slots; slot += 1) {
    const i = at(slot);
    const out = departures[i];
    const inbound = arrivals[i];
    net[slot] = cumulative;
    sigma[slot] = Math.sqrt(noise + terms.day * cumulative * cumulative + terms.hour * hourSquares);
    lowest = Math.min(lowest, cumulative);
    totalDepartures += out;
    const change = inbound - out;
    noise +=
      inbound * (1 + idiosyncraticAlpha(alphaArrivals[i], terms) * inbound) +
      out * (1 + idiosyncraticAlpha(alphaDepartures[i], terms) * out);
    const hour = slot >> 2;
    hourSquares += change * (2 * perHour[hour] + change);
    perHour[hour] += change;
    cumulative += change;
  }
  return { net, sigma, baseline: Math.ceil(-lowest) + Math.round(POPULARITY_SHARE * totalDepartures) };
}

export type GroupStock = { net: Float64Array; sigma: Float64Array };

/**
 * Cumulative net change since midnight of the stations of one neighbourhood and its standard deviation.
 * Variance: noise + (D + R) * M^2 + H * sum_h M_h^2 + Ds * sum_s M_s^2 + Hs * sum_sh M_sh^2.
 * `at(member, slot)` is the index of the slot in the four series.
 */
export function groupStock(
  members: number,
  { departures, arrivals, alphaDepartures, alphaArrivals }: FlowSeries,
  terms: ShockTerms,
  slots: number,
  at: (member: number, slot: number) => number,
): GroupStock {
  const net = new Float64Array(slots);
  const sigma = new Float64Array(slots);
  const hours = slots / 4;
  const cumulative = new Float64Array(members);
  const perHour = new Float64Array(members * hours);
  const hourTotals = new Float64Array(hours);
  let total = 0;
  let noise = 0;
  let stationSquares = 0;
  let hourSquares = 0;
  let stationHourSquares = 0;
  for (let slot = 0; slot < slots; slot += 1) {
    net[slot] = total;
    sigma[slot] = Math.sqrt(
      noise +
        (terms.D + terms.R) * total * total +
        terms.H * hourSquares +
        terms.Ds * stationSquares +
        terms.Hs * stationHourSquares,
    );
    const hour = slot >> 2;
    let slotChange = 0;
    for (let member = 0; member < members; member += 1) {
      const i = at(member, slot);
      const out = departures[i];
      const inbound = arrivals[i];
      const change = inbound - out;
      noise +=
        inbound * (1 + idiosyncraticAlpha(alphaArrivals[i], terms) * inbound) +
        out * (1 + idiosyncraticAlpha(alphaDepartures[i], terms) * out);
      stationSquares += change * (2 * cumulative[member] + change);
      cumulative[member] += change;
      const cell = member * hours + hour;
      stationHourSquares += change * (2 * perHour[cell] + change);
      perHour[cell] += change;
      slotChange += change;
    }
    hourSquares += slotChange * (2 * hourTotals[hour] + slotChange);
    hourTotals[hour] += slotChange;
    total += slotChange;
  }
  return { net, sigma };
}

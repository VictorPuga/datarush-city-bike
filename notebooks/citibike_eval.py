"""Evaluation harness for the Citi Bike demand models.

Implements the fixed protocol described in docs/evaluation.md.
Only numpy, pandas, scipy and pyarrow are needed (no torch), so any model family can be scored the same way.

A model is a function ``predict(data, train_days, block) -> P`` that returns the expected counts
``P[n_stations, n_slots_in_block, 4]`` for the four targets (departures and arrivals, classic and electric).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.special import gammaln

SEED = 42
SLOTS_DIA = 96
TARGETS = ['salidas_classic', 'salidas_electric', 'llegadas_classic', 'llegadas_electric']
EVAL_TARGETS = TARGETS + ['salidas_total', 'llegadas_total']
LEVELS = ('15min', 'hour', 'day')

# ── fixed protocol (docs/evaluation.md) ───────────────────────────────────────
TRAIN_END = '2026-09-02'  # last day of the parity train block
VAL = ('2026-09-03', '2026-09-16')
TEST = ('2026-09-17', '2026-09-30')  # never used to choose anything
FOLDS = [('fold1', '2026-08-13', '2026-08-19'), ('fold2', '2026-08-20', '2026-08-26'), ('fold3', '2026-08-27', '2026-09-02'),
         ('fold4', '2026-09-03', '2026-09-09'), ('fold5', '2026-09-10', '2026-09-16')]
TIER_EDGES = [2, 5, 15, 40]  # departures per day in the training window
TIER_NAMES = ['<2', '2-5', '5-15', '15-40', '>40']


# ── data ──────────────────────────────────────────────────────────────────────
@dataclass
class Data:
  est: pd.DataFrame  # one row per station, ordered by station_idx
  slots: pd.DataFrame  # one row per 15-minute slot: calendar and weather
  Y: np.ndarray  # int16 [n_est, n_slots, 4]
  act: np.ndarray  # bool [n_est, n_slots]: the station is inside its active window
  days: pd.DatetimeIndex  # one entry per day
  daytype: np.ndarray  # per day: 0 workday, 1 weekend or holiday
  dow: np.ndarray  # per day: 0 Monday ... 6 Sunday
  holiday: np.ndarray  # per day: federal holiday flag
  meta: dict

  @property
  def n_est(self):
    return len(self.est)

  @property
  def n_days(self):
    return len(self.days)

  def day(self, date):
    """Index of a date (string or Timestamp) in ``days``."""
    return int(self.days.get_loc(pd.Timestamp(date)))

  def block(self, name, first, last):
    """Half-open day range [d0, d1) for the inclusive dates first..last."""
    return Block(name, self.day(first), self.day(last) + 1)


@dataclass
class Block:
  name: str
  d0: int
  d1: int

  @property
  def s0(self):
    return self.d0 * SLOTS_DIA

  @property
  def s1(self):
    return self.d1 * SLOTS_DIA


def add_weather_features(slots):
  """Rain of the previous 2 hours, computed exactly as in the training notebook."""
  s = slots.copy()
  s['precip_prev2h'] = (s['precipitation'].shift(1).rolling(8, min_periods=1).sum() / 4).fillna(0)
  return s


def load_processed(path, cache_dir=None):
  """Read the parquet files written by LIMPIEZA_citibike.ipynb into dense arrays.

    ``Y`` and ``act`` are cached as .npy files so later calls are instant.
    """
  import pyarrow.parquet as pq
  path = Path(path)
  est = pd.read_parquet(path / 'estaciones.parquet').sort_values('station_idx').reset_index(drop=True)
  slots = add_weather_features(pd.read_parquet(path / 'slots.parquet').sort_values('slot_idx').reset_index(drop=True))
  meta = json.loads((path / 'metadata.json').read_text())
  n_est, n_slots = len(est), len(slots)
  assert (est['station_idx'].values == np.arange(n_est)).all() and (slots['slot_idx'].values == np.arange(n_slots)).all()

  src = path / 'demanda_15min.parquet'
  key = f'{src.stat().st_size}_{int(src.stat().st_mtime)}'
  cache = Path(cache_dir) if cache_dir else None
  fy, fa = (cache / f'Y_{key}.npy', cache / f'act_{key}.npy') if cache else (None, None)
  if cache and fy.exists() and fa.exists():
    Y, act = np.load(fy, mmap_mode='r'), np.load(fa, mmap_mode='r')
  else:
    Y = np.zeros((n_est, n_slots, 4), dtype=np.int16)
    act = np.zeros((n_est, n_slots), dtype=bool)
    for batch in pq.ParquetFile(src).iter_batches(batch_size=4_000_000, columns=['station_idx', 'slot_idx'] + TARGETS):
      s = batch.column(0).to_numpy(zero_copy_only=False).astype(np.int64)
      t = batch.column(1).to_numpy(zero_copy_only=False).astype(np.int64)
      act[s, t] = True
      for k in range(4):
        Y[s, t, k] = batch.column(2 + k).to_numpy(zero_copy_only=False)
    if cache:
      cache.mkdir(parents=True, exist_ok=True)
      for old in cache.glob('Y_*.npy'):
        old.unlink()
      for old in cache.glob('act_*.npy'):
        old.unlink()
      np.save(fy, Y)
      np.save(fa, act)
  per_day = slots.groupby('fecha', sort=True).agg(dow=('dia_semana', 'first'),
                                                  libre=('dia_libre', 'first'),
                                                  fest=('es_festivo', 'first'))
  return Data(est, slots, Y, act, pd.DatetimeIndex(per_day.index), per_day['libre'].values.astype(np.int8),
              per_day['dow'].values.astype(np.int8), per_day['fest'].values.astype(bool), meta)


# ── baselines ─────────────────────────────────────────────────────────────────
def _group_means(data, d0, d1, group_of_day, n_groups):
  """Mean count per (station, group, slot of day, target) over the ACTIVE cells of days d0..d1.

    Returns (means, counts, fallback).  ``fallback[g, slot, k]`` is the median over stations of their group mean:
    it is used for stations with no training data in that group (cold start).
    """
  n = data.n_est
  sums = np.zeros((n, n_groups, SLOTS_DIA, 4))
  cnt = np.zeros((n, n_groups, SLOTS_DIA))
  for d in range(d0, d1):
    sl = slice(d * SLOTS_DIA, (d + 1) * SLOTS_DIA)
    a = data.act[:, sl]
    g = group_of_day[d]
    sums[:, g] += data.Y[:, sl].astype(np.float64) * a[:, :, None]
    cnt[:, g] += a
  means = sums / np.maximum(cnt, 1)[..., None]
  fallback = np.zeros((n_groups, SLOTS_DIA, 4))
  for g in range(n_groups):
    have = cnt[:, g].sum(1) > 0
    if have.any():
      fallback[g] = np.median(means[have, g], axis=0)
  return means, cnt, fallback


def baseline_predict(data, kind, train_days, block):
  """Historical-average baselines fitted on days ``train_days = (d0, d1)`` and applied to ``block``.

    kind: 'A' station mean | 'B' station x weekday x slot | 'C' station x workday-or-free x slot.
    Stations with no training data use the median station profile of that group (cold-start rule).
    """
  d0, d1 = train_days
  days = np.arange(block.d0, block.d1)
  if kind == 'A':
    means, cnt, fb = _group_means(data, d0, d1, np.zeros(data.n_days, dtype=int), 1)
    station = (means[:, 0] * cnt[:, 0, :, None]).sum(1) / np.maximum(cnt[:, 0].sum(1), 1)[:, None]
    have = cnt[:, 0].sum(1) > 0
    station[~have] = np.median(station[have], axis=0)
    P = np.broadcast_to(station[:, None, None, :], (data.n_est, len(days), SLOTS_DIA, 4))
  else:
    g_of_day = data.dow.astype(int) if kind == 'B' else data.daytype.astype(int)
    n_groups = 7 if kind == 'B' else 2
    means, cnt, fb = _group_means(data, d0, d1, g_of_day, n_groups)
    P = means[:, g_of_day[days]]  # [n, days, 96, 4]
    miss = cnt[:, g_of_day[days]] == 0  # [n, days, 96]
    P = np.where(miss[..., None], fb[g_of_day[days]][None], P)
  return np.ascontiguousarray(P.reshape(data.n_est, len(days) * SLOTS_DIA, 4), dtype=np.float32)


def baseline_level_scaled(data, kind, train_days, block, level_days=28):
  """Baseline ``kind`` rescaled by a city-wide level factor per target.

    The factor is sum(observed) / sum(baseline) over the last ``level_days`` days of the training window,
    so the profile comes from the whole history and the level from the recent weeks.
    """
  d0, d1 = train_days
  P = baseline_predict(data, kind, train_days, block)
  recent = Block('recent', max(d0, d1 - level_days), d1)
  Pr = baseline_predict(data, kind, train_days, recent)
  Yr, ar = data.Y[:, recent.s0:recent.s1], data.act[:, recent.s0:recent.s1]
  factor = (Yr.astype(np.float64) * ar[..., None]).sum((0, 1)) / np.maximum((Pr.astype(np.float64) * ar[..., None]).sum(
      (0, 1)), 1e-9)
  return (P * factor[None, None, :]).astype(np.float32), factor


# ── metrics ───────────────────────────────────────────────────────────────────
def _ext(a):
  """Append total departures and total arrivals as extra targets."""
  return np.concatenate([a, a[..., :2].sum(-1, keepdims=True), a[..., 2:].sum(-1, keepdims=True)], axis=-1)


def _aggregate(a, level):
  n, s, k = a.shape
  if level == '15min':
    return a
  step = 4 if level == 'hour' else SLOTS_DIA
  return a.reshape(n, s // step, step, k).sum(2)


def _mask(act, level):
  n, s = act.shape
  if level == '15min':
    return act
  step = 4 if level == 'hour' else SLOTS_DIA
  return act.reshape(n, s // step, step).all(2)


def poisson_deviance(y, p):
  p = np.clip(p, 1e-8, None)
  with np.errstate(divide='ignore', invalid='ignore'):
    t = np.where(y > 0, y * np.log(y / p), 0.0)
  return 2 * (t - (y - p))


def poisson_logscore(y, mu):
  """Mean of -log P(y | Poisson(mu)): a proper score, comparable across distributions."""
  mu = np.clip(mu, 1e-8, None)
  return mu - y * np.log(mu) + gammaln(y + 1)


def nb_logscore(y, mu, alpha):
  """-log P(y) for a negative binomial with mean mu and variance mu + alpha * mu**2."""
  mu = np.clip(mu, 1e-8, None)
  r = 1.0 / np.clip(alpha, 1e-6, None)
  return -(gammaln(y + r) - gammaln(r) - gammaln(y + 1) + r * np.log(r / (r + mu)) + y * np.log(mu / (r + mu)))


def point_metrics(Y, P, act, levels=LEVELS):
  """Point-forecast metrics for every target and aggregation level on one block.

    Y, P: [n_est, n_slots, 4].  Rows: one per (level, target).
    Columns: n, mean_y, mae, rmse, wape (sum|e| / sum y), bias (sum p / sum y), deviance, smape (hour and day only).
    """
  Ye, Pe = _ext(Y.astype(np.float64)), _ext(P.astype(np.float64))
  rows = []
  for level in levels:
    y, p, m = _aggregate(Ye, level), _aggregate(Pe, level), _mask(act, level)
    for k, name in enumerate(EVAL_TARGETS):
      yy, pp = y[..., k][m], p[..., k][m]
      e = pp - yy
      den = np.abs(pp) + np.abs(yy)
      smape = np.where(den > 0, 2 * np.abs(e) / np.where(den > 0, den, 1), 0.0).mean() if level != '15min' else np.nan
      rows.append(
          dict(level=level,
               target=name,
               n=len(yy),
               mean_y=yy.mean(),
               mae=np.abs(e).mean(),
               rmse=np.sqrt((e**2).mean()),
               wape=np.abs(e).sum() / yy.sum(),
               bias=pp.sum() / yy.sum(),
               deviance=poisson_deviance(yy, pp).mean(),
               smape=smape))
  return pd.DataFrame(rows)


def logscore_poisson(Y, P, act):
  """Mean -log p(y) per target at 15 minutes, with a Poisson predictive distribution."""
  y, p = Y[act].astype(np.float64), P[act].astype(np.float64)
  return pd.Series({t: poisson_logscore(y[:, k], p[:, k]).mean() for k, t in enumerate(TARGETS)})


def quantile_lookup(mu, q, alpha=None, step=0.01):
  """Quantile of Poisson(mu) or NB(mu, alpha) for every element, computed once per quantised (log mu, alpha) pair."""
  mu = np.clip(np.asarray(mu, dtype=np.float64), 1e-6, None)
  lq = np.round(np.log(mu) / step).astype(np.int32)
  if alpha is None:
    uniq, inv = np.unique(lq, return_inverse=True)
    vals = stats.poisson.ppf(q, np.exp(uniq * step))
    return vals[inv].reshape(mu.shape)
  aq = np.round(np.asarray(alpha, dtype=np.float64) * 100).astype(np.int32)
  key = lq.astype(np.int64) * 100000 + aq
  uniq, inv = np.unique(key.ravel(), return_inverse=True)
  m_u = np.exp((uniq // 100000) * step)
  a_u = np.clip((uniq % 100000) / 100.0, 0.01, None)
  r = 1.0 / a_u
  vals = stats.nbinom.ppf(q, r, r / (r + m_u))
  return vals[inv].reshape(mu.shape)


def interval_metrics(y, lo, hi, level):
  """Coverage, mean width and Winkler interval score of central intervals [lo, hi]."""
  a = 1 - level
  miss_lo, miss_hi = np.clip(lo - y, 0, None), np.clip(y - hi, 0, None)
  return dict(level=level,
              coverage=float(np.mean((y >= lo) & (y <= hi))),
              mean_width=float(np.mean(hi - lo)),
              winkler=float(np.mean((hi - lo) + 2 / a * (miss_lo + miss_hi))))


def poisson_intervals(Y, P, act, levels=(0.8, 0.9), agg_levels=LEVELS):
  """Interval metrics for Poisson predictive distributions at 15 minutes, per station-hour and per station-day.

    Sums of independent Poisson counts are Poisson, so the aggregated interval uses mu = sum of the rates.
    This assumes independence between slots: the check shows where that assumption fails.
    """
  Ye, Pe = _ext(Y.astype(np.float64)), _ext(P.astype(np.float64))
  rows = []
  for agg in agg_levels:
    y, mu, m = _aggregate(Ye, agg), _aggregate(Pe, agg), _mask(act, agg)
    for k, t in enumerate(EVAL_TARGETS):
      yy, mm = y[..., k][m], mu[..., k][m]
      for lv in levels:
        lo = quantile_lookup(mm, (1 - lv) / 2)
        hi = quantile_lookup(mm, 1 - (1 - lv) / 2)
        rows.append(dict(agg=agg, target=t, **interval_metrics(yy, lo, hi, lv)))
  return pd.DataFrame(rows)


# ── breakdowns ────────────────────────────────────────────────────────────────
def volume_tiers(data, d0, d1):
  """Tier of every station from its mean departures per day in the training window (-1 = no training data)."""
  dep = data.Y[:, d0 * SLOTS_DIA:d1 * SLOTS_DIA, :2].sum(-1).astype(np.float64)
  act = data.act[:, d0 * SLOTS_DIA:d1 * SLOTS_DIA]
  days_active = act.sum(1) / SLOTS_DIA
  per_day = np.where(days_active > 0, (dep * act).sum(1) / np.maximum(days_active, 1e-9), np.nan)
  tier = np.digitize(per_day, TIER_EDGES)
  tier[np.isnan(per_day)] = -1
  return tier


def load_regions(repo_root, est):
  """Borough and NTA of every station: the UI assignment when it exists, point-in-polygon otherwise."""
  rj = json.loads((Path(repo_root) / 'ui/src/data/regions.json').read_text())
  info = {r['id']: (r['name'], r['borough']) for r in rj['regions']}
  nta = est['station_id'].map(rj['assignments'])
  missing = np.nonzero(nta.isna().values)[0]
  if len(missing):
    for r in rj['regions']:
      for poly in r['polygons']:
        ring = np.asarray(poly[0])  # outer ring, [lng, lat]
        x0, y0, x1, y1 = ring[:, 0].min(), ring[:, 1].min(), ring[:, 0].max(), ring[:, 1].max()
        for i in missing:
          lng, lat = est.at[i, 'lng'], est.at[i, 'lat']
          if not (x0 <= lng <= x1 and y0 <= lat <= y1) or not pd.isna(nta.iat[i]):
            continue
          xs, ys = ring[:, 0], ring[:, 1]
          j = np.arange(len(ring)) - 1
          cross = ((ys > lat) != (ys[j] > lat)) & (lng < (xs[j] - xs) * (lat - ys) / (ys[j] - ys + 1e-18) + xs)
          if cross.sum() % 2 == 1:
            nta.iat[i] = r['id']
  return pd.DataFrame({
      'nta_id': nta.fillna('unassigned').values,
      'nta': [info.get(v, ('unassigned', 'unassigned'))[0] for v in nta.fillna('unassigned')],
      'borough': [info.get(v, ('unassigned', 'unassigned'))[1] for v in nta.fillna('unassigned')]
  })


def _cell_stats(y, p):
  return dict(abs_err=np.abs(p - y), sq_err=(p - y)**2, dev=poisson_deviance(y, p), y=y, p=p)


def breakdown(Y, P, act, slots_blk, groups, target='salidas_total'):
  """Metrics of one target at 15 minutes split by station groups and by time groups.

    groups: dict name -> per-station labels (array of length n_est).
    Time groups (hour of day, weekday, day type) come from ``slots_blk``.
    """
  k = EVAL_TARGETS.index(target)
  Ye, Pe = _ext(Y.astype(np.float64))[..., k], _ext(P.astype(np.float64))[..., k]
  c = _cell_stats(Ye, Pe)
  a = act.astype(np.float64)
  per_station = {s: (v * a).sum(1) for s, v in c.items()}
  per_slot = {s: (v * a).sum(0) for s, v in c.items()}
  n_station, n_slot = a.sum(1), a.sum(0)
  rows = []

  def add(dim, label, sums, n):
    if n <= 0:
      return
    rows.append(
        dict(dimension=dim,
             group=label,
             target=target,
             n=int(n),
             mean_y=sums['y'] / n,
             mae=sums['abs_err'] / n,
             rmse=np.sqrt(sums['sq_err'] / n),
             wape=sums['abs_err'] / sums['y'] if sums['y'] > 0 else np.nan,
             bias=sums['p'] / sums['y'] if sums['y'] > 0 else np.nan,
             deviance=sums['dev'] / n))

  for dim, labels in groups.items():
    labels = np.asarray(labels)
    for g in pd.unique(labels):
      m = labels == g
      add(dim, g, {s: v[m].sum() for s, v in per_station.items()}, n_station[m].sum())
  ts = pd.to_datetime(slots_blk['timestamp'])
  fest = slots_blk['es_festivo'].values == 1
  daytype = np.where(fest, 'holiday', np.where(ts.dt.dayofweek.values >= 5, 'weekend', 'workday'))
  for dim, labels in [('hour', ts.dt.hour.values), ('weekday', ts.dt.dayofweek.values), ('day_type', daytype)]:
    for g in pd.unique(labels):
      m = labels == g
      add(dim, g, {s: v[m].sum() for s, v in per_slot.items()}, n_slot[m].sum())
  return pd.DataFrame(rows)


def station_groups(data, d0, d1, repo_root):
  reg = load_regions(repo_root, data.est)
  tier = volume_tiers(data, d0, d1)
  names = np.array(['no training data'] + TIER_NAMES, dtype=object)
  return {'volume_tier': names[tier + 1], 'borough': reg['borough'].values, 'nta': reg['nta'].values}


# ── adapter for the shipped v2 network (ONNX) ─────────────────────────────────
def v2_predict(data, block, onnx_path, ids_path):
  """Run the shipped ONNX model on a block of days and map its stations to ``data.est`` by station_id.

    Stations the model never saw get the median model station of each slot (cold-start rule).
    """
  import onnxruntime as ort
  sess = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
  ids = json.loads(Path(ids_path).read_text())
  pos = pd.Series(np.arange(len(ids)), index=ids).reindex(data.est['station_id'].astype(str)).values
  known = ~np.isnan(pos)
  cols = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'precipitation', 'precip_prev2h', 'weather_code']
  out = np.zeros((data.n_est, (block.d1 - block.d0) * SLOTS_DIA, 4), dtype=np.float32)
  for d in range(block.d0, block.d1):
    s = data.slots.iloc[d * SLOTS_DIA:(d + 1) * SLOTS_DIA]
    lam = sess.run(
        ['lambda'], {
            'slot_dia': s['slot_dia'].values.astype(np.int64),
            'dia_semana': s['dia_semana'].values.astype(np.int64),
            'es_festivo': s['es_festivo'].values.astype(np.float32),
            'clima': s[cols].values.astype(np.float32)
        })[0]  # [96, n_model, 4]
    lam = lam.transpose(1, 0, 2)  # [n_model, 96, 4]
    sl = slice((d - block.d0) * SLOTS_DIA, (d - block.d0 + 1) * SLOTS_DIA)
    out[known, sl] = lam[pos[known].astype(int)]
    out[~known, sl] = np.median(lam, axis=0)
  return out


def block_arrays(data, block):
  """Observed counts, activity mask and slot table of a block."""
  return data.Y[:, block.s0:block.s1], data.act[:, block.s0:block.s1], data.slots.iloc[block.s0:block.s1]


# ── protocol runners ──────────────────────────────────────────────────────────
PARITY_START = '2026-07-01'  # first day of the window v2 was trained on
BAR_CANDIDATES = ['A|all', 'B|all', 'B|jul-sep', 'B|8w', 'C|all', 'C|jul-sep', 'C|8w', 'C|all+level']


def _windows(end):
  return {'all': (0, end), '8w': (max(0, end - 56), end)}


def _tag(df, model, fit, block):
  df.insert(0, 'model', model)
  df.insert(1, 'fit', fit)
  df.insert(2, 'block', block)
  return df


def run_baselines(data):
  """Baselines on the five rolling folds, the validation block and the test block.

    Windows: 'all' = whole history before the block, '8w' = last 8 weeks, 'jul-sep' = the window v2 was trained on,
    'all+level' = whole-history profile rescaled by the level of the last 4 weeks.
    Returns (metrics, test_predictions) where test_predictions holds the train-only test forecasts used for the breakdowns.
    """
  val, test = data.block('val', *VAL), data.block('test', *TEST)
  d_train_end, d_val_end, d_start = data.day(TRAIN_END) + 1, val.d1, data.day(PARITY_START)
  out, keep = [], {}

  def add(kind, wname, win, block, fit):
    if kind == 'L':
      P, _ = baseline_level_scaled(data, 'C', win, block)
      name = 'C|all+level'
    else:
      P = baseline_predict(data, kind, win, block)
      name = f'{kind}|{wname}'
    Yb, ab, _ = block_arrays(data, block)
    out.append(_tag(point_metrics(Yb, P, ab), name, fit, block.name))
    if block.name == 'test':
      keep[(name, fit)] = P

  for block, fit, end in [(val, 'train-only', d_train_end), (test, 'train-only', d_train_end), (test, 'refit', d_val_end)]:
    wins = _windows(end)
    if fit == 'train-only':
      wins['jul-sep'] = (d_start, end)
    for kind in 'ABC':
      for wname, win in wins.items():
        if not (kind == 'A' and wname != 'all'):
          add(kind, wname, win, block, fit)
    add('L', 'all+level', (0, end), block, fit)
  for name, first, last in FOLDS:
    fold = data.block(name, first, last)
    for kind in 'ABC':
      for wname, win in _windows(fold.d0).items():
        if not (kind == 'A' and wname != 'all'):
          add(kind, wname, win, fold, 'rolling')
    add('L', 'all+level', (0, fold.d0), fold, 'rolling')
  return pd.concat(out, ignore_index=True), keep


def run_v2(data, onnx_path, ids_path):
  """The shipped v2 network on the validation and test blocks (it was trained on Jul 1 - Sep 2 and early-stopped on val)."""
  out, keep = [], {}
  for block in [data.block('val', *VAL), data.block('test', *TEST)]:
    P = v2_predict(data, block, onnx_path, ids_path)
    Yb, ab, _ = block_arrays(data, block)
    out.append(_tag(point_metrics(Yb, P, ab), 'v2 network', 'train-only (shipped)', block.name))
    if block.name == 'test':
      keep[('v2 network', 'train-only (shipped)')] = P
  return pd.concat(out, ignore_index=True), keep


def summary(metrics, levels=('15min', 'hour', 'day')):
  """One row per model: mean over departures and arrivals totals of deviance, WAPE and bias."""
  s = metrics[metrics['target'].isin(['salidas_total', 'llegadas_total'])]
  cols = {}
  for lv, metric, label in [('15min', 'deviance', 'deviance_15min'), ('15min', 'mae', 'mae_15min'), ('hour', 'wape', 'wape_hour'),
                            ('day', 'wape', 'wape_day'), ('15min', 'bias', 'bias')]:
    cols[label] = s[s['level'] == lv].groupby('model')[metric].mean()
  return pd.DataFrame(cols)


def choose_bar(metrics):
  """The strongest baseline on the validation block (train-only fit) by 15-minute deviance: chosen without the test block."""
  val = metrics[(metrics['block'] == 'val') & (metrics['fit'] == 'train-only') & (metrics['model'].isin(BAR_CANDIDATES))]
  table = summary(val).loc[lambda t: t.index.isin(BAR_CANDIDATES)].sort_values('deviance_15min')
  return table.index[0], table

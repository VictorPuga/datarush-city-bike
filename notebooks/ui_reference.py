"""Reference for the dashboard port: what the UI computes from Open-Meteo hourly values and the v3 ONNX outputs.

The TypeScript code in ``ui/src/lib`` must give the same numbers as the functions here.
``build_fixture`` writes the numbers to ``data/results/ui_reference_v3.json`` and ``check_fixture`` re-checks them.
Every formula is the one scored in ``citibike_intervals.py``, applied at the resolution the dashboard shows.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

DEP_C, DEP_E, ARR_C, ARR_E = 0, 1, 2, 3
BIKES = {'classic': (DEP_C, ARR_C), 'electric': (DEP_E, ARR_E)}
SLOTS = 96
Z_80 = 1.28  # the multiplier the dashboard already uses for its 80% bands
POPULARITY_SHARE = 0.05
ALPHA_FLOOR = 0.01
HOURLY_VARS = ('temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'precipitation', 'weather_code')


def js_round(x):
  """Math.round of JavaScript: halves go up."""
  return math.floor(x + 0.5)


def clima_day(hourly):
  """The ``clima`` input [96, 6] of one day from the hourly Open-Meteo values of the day before, the day and the day after.

  ``hourly`` maps each name in HOURLY_VARS to 72 values: 00:00 of day-1 to 23:00 of day+1 (start_date=day-1, end_date=day+1).
  As in the training notebook:
    - temperature, humidity and wind are interpolated linearly in time between the hourly stamps;
    - the rain of hour h is the value stamped h+1 (Open-Meteo stamps the rain of the hour that ends there)
      and it is held for the four slots of the hour; so is the weather code (stamp h);
    - ``precip_prev2h`` is the sum of the rain rate of the 8 slots before the slot, divided by 4 (millimetres in 2 hours).
  """
  h = {k: np.asarray(hourly[k], dtype=np.float64) for k in HOURLY_VARS}
  assert all(len(v) == 72 for v in h.values())
  j = np.arange(96, 192)  # slots of the day inside the 192 slots of day-1 and day
  hour, frac = j // 4, (j % 4) / 4
  smooth = lambda v: v[hour] + frac * (v[hour + 1] - v[hour])
  rain_rate = h['precipitation'][1:49][np.arange(192) // 4]  # slot j holds the value stamped one hour later
  prev2h = np.array([rain_rate[k - 8:k].sum() / 4 for k in j])
  out = np.stack([
      smooth(h['temperature_2m']),
      smooth(h['relative_humidity_2m']),
      smooth(h['wind_speed_10m']), rain_rate[96:], prev2h, h['weather_code'][hour]
  ],
                 axis=1)
  return out.astype(np.float32)


def nb_quantile(mu, alpha, q):
  """Smallest k with P(Y <= k) >= q for a negative binomial with mean mu and variance mu + alpha mu^2."""
  if mu < 1e-9:
    return 0
  r = 1.0 / max(alpha, 1e-4)
  odds = mu / (r + mu)  # 1 - p
  pmf = math.exp(r * math.log(r / (r + mu)))
  cdf, k = pmf, 0
  limit = int(mu + 12 * math.sqrt(mu + alpha * mu * mu) + 50)
  while cdf < q - 1e-12 and k < limit:
    pmf *= (k + r) / (k + 1) * odds
    k += 1
    cdf += pmf
  return k


def nb_quantile_vec(mu, alpha, q):
  """Same as ``nb_quantile`` over arrays (vectorised, for the fixture)."""
  mu, alpha = np.broadcast_arrays(np.asarray(mu, dtype=np.float64), np.asarray(alpha, dtype=np.float64))
  return np.array([nb_quantile(m, a, q) for m, a in zip(mu.ravel(), alpha.ravel())], dtype=np.int64).reshape(mu.shape)


def shock_terms(shocks, bike):
  s = shocks[bike]
  total = s['D'] + s['H'] + s['R'] + s['Ds'] + s['Hs']
  return dict(total=total,
              day=s['D'] + s['R'] + s['Ds'],
              hour=s['H'] + s['Hs'],
              D=s['D'],
              H=s['H'],
              R=s['R'],
              Ds=s['Ds'],
              Hs=s['Hs'])


def station_day(lam, alpha, shocks):
  """Stock mean and standard deviation at the start of each slot, per bike type, for one station.

  lam, alpha: [96, 4].  Returns {bike: dict(stock, sigma, net, noise, baseline)}.
  The stock is the baseline plus the net change since 00:00, and the baseline is the unchanged assumption of the dashboard.
  The variance of the net change since midnight (arrivals minus departures) is
    noise + (D + R + Ds) * M^2 + (H + Hs) * sum over hours of M_h^2
  with M the net mean so far and M_h the net mean accumulated in each hour so far (the partial current hour included).
  """
  out = {}
  for bike, (dep, arr) in BIKES.items():
    t = shock_terms(shocks, bike)
    a_dep = np.maximum(alpha[:, dep] - t['total'], ALPHA_FLOOR)
    a_arr = np.maximum(alpha[:, arr] - t['total'], ALPHA_FLOOR)
    net = lam[:, arr] - lam[:, dep]
    noise = lam[:, arr] * (1 + a_arr * lam[:, arr]) + lam[:, dep] * (1 + a_dep * lam[:, dep])
    cum_net = np.concatenate([[0.0], np.cumsum(net)[:-1]])
    cum_noise = np.concatenate([[0.0], np.cumsum(noise)[:-1]])
    hour_term = np.zeros(SLOTS)
    for slot in range(SLOTS):
      per_hour = np.zeros(24)
      for k in range(slot):
        per_hour[k // 4] += net[k]
      hour_term[slot] = (per_hour**2).sum()
    var = cum_noise + t['day'] * cum_net**2 + t['hour'] * hour_term
    baseline = math.ceil(-min(0.0, cum_net.min())) + js_round(POPULARITY_SHARE * lam[:, dep].sum())
    out[bike] = dict(stock=baseline + cum_net, sigma=np.sqrt(var), net=net, noise=noise, baseline=baseline)
  return out


def stock_band(value, sigma):
  spread = Z_80 * sigma
  return js_round(value), max(0, math.floor(value - spread)), math.ceil(value + spread)


def flow_band(lam, alpha):
  """Mean (one decimal), 10% and 90% quantiles of one 15-minute cell."""
  return round(float(lam), 1), nb_quantile(lam, alpha, 0.1), nb_quantile(lam, alpha, 0.9)


def group_slot(lams, alphas, shocks, bike, kind):
  """Mean and standard deviation of the departures or arrivals of a group of stations in one slot.

  lams, alphas: [n_stations] of one target and slot.  Shocks: D, H and R are shared by the whole group (R: a neighbourhood),
  Ds and Hs are independent between stations.
  """
  t = shock_terms(shocks, bike)
  alpha_idio = np.maximum(alphas - t['total'], ALPHA_FLOOR)
  mean = lams.sum()
  var = (lams + alpha_idio * lams**2).sum() + (t['D'] + t['H'] + t['R']) * mean**2 + (t['Ds'] + t['Hs']) * (lams**2).sum()
  return mean, math.sqrt(var)


def group_stock(lam, alpha, shocks):
  """Stock mean and standard deviation per slot of a group of stations inside one neighbourhood.

  lam, alpha: [n_stations, 96, 4].  The baseline of the group is the sum of the baselines of its stations.
  Variance of the cumulative net change since midnight:
    sum of station noise + (D + R) * M^2 + H * sum_h M_h^2 + Ds * sum_s M_s^2 + Hs * sum_{s,h} M_sh^2.
  """
  out = {}
  for bike, (dep, arr) in BIKES.items():
    t = shock_terms(shocks, bike)
    n = lam.shape[0]
    net = np.zeros((n, SLOTS))
    noise = np.zeros((n, SLOTS))
    baseline = 0
    for i in range(n):
      d = station_day(lam[i], alpha[i], shocks)[bike]
      net[i], noise[i] = d['net'], d['noise']
      baseline += d['baseline']
    cum = np.concatenate([np.zeros((n, 1)), np.cumsum(net, axis=1)[:, :-1]], axis=1)
    cum_noise = np.concatenate([np.zeros((n, 1)), np.cumsum(noise, axis=1)[:, :-1]], axis=1).sum(0)
    M = cum.sum(0)
    a_Ds = (cum**2).sum(0)
    a_H = np.zeros(SLOTS)
    a_Hs = np.zeros(SLOTS)
    for slot in range(SLOTS):
      ph = np.zeros((n, 24))
      for k in range(slot):
        ph[:, k // 4] += net[:, k]
      a_H[slot] = (ph.sum(0)**2).sum()
      a_Hs[slot] = (ph**2).sum()
    var = cum_noise + (t['D'] + t['R']) * M**2 + t['H'] * a_H + t['Ds'] * a_Ds + t['Hs'] * a_Hs
    out[bike] = dict(stock=baseline + M, sigma=np.sqrt(var), baseline=baseline)
  return out


def group_flow_band(mean, sd):
  """10% and 90% quantiles of the departures or arrivals of a group: the negative binomial with that mean and variance."""
  alpha = max((sd * sd - mean) / max(mean, 1e-9)**2, 1e-4)
  return nb_quantile(mean, alpha, 0.1), nb_quantile(mean, alpha, 0.9)


def _r(a, digits):
  return np.round(np.asarray(a, dtype=np.float64), digits).tolist()


def build_fixture(repo, date='2026-09-27'):
  """Numbers the TypeScript port has to reproduce for one day, from the hourly weather to the interval bounds."""
  import onnxruntime as ort
  import pandas as pd
  repo = Path(repo)
  meta = json.loads((repo / 'notebooks/modelos/estaciones_onnx_v3.json').read_text())
  ids = json.loads((repo / 'notebooks/modelos/station_ids_v3.json').read_text())
  index = {s: i for i, s in enumerate(ids)}
  active = {m['station_id']: m['active'] for m in meta['stations']}
  shocks = meta['intervals']['shocks']
  v2_ids = set(json.loads((repo / 'ui/models/station_ids.json').read_text()))
  stations = json.loads((repo / 'ui/src/data/stations.json').read_text())
  regions = json.loads((repo / 'ui/src/data/regions.json').read_text())
  assign = regions['assignments']

  hourly_all = pd.read_parquet(repo / 'notebooks/data_procesada/clima_horario_raw.parquet')
  hourly_all['time'] = pd.to_datetime(hourly_all['time'])
  hourly_all = hourly_all.set_index('time')
  d = pd.Timestamp(date)
  rows = hourly_all.loc[d - pd.Timedelta(days=1):d + pd.Timedelta(days=1, hours=23)]
  hourly = {k: [float(x) for x in rows[k]] for k in HOURLY_VARS}
  clima = clima_day(hourly)
  slots = pd.read_parquet(repo / 'notebooks/data_procesada/slots.parquet')
  today = slots[slots['fecha'].astype(str).str[:10] == date]
  weekday, holiday = int(today['dia_semana'].iloc[0]), int(today['es_festivo'].iloc[0])

  session = ort.InferenceSession(str(repo / 'notebooks/modelos/demanda_net_v3.onnx'), providers=['CPUExecutionProvider'])
  out = session.run(
      None, {
          'slot_dia': np.arange(SLOTS, dtype=np.int64),
          'dia_semana': np.full(SLOTS, weekday, dtype=np.int64),
          'es_festivo': np.full(SLOTS, holiday, dtype=np.float32),
          'clima': clima
      })
  names = [o.name for o in session.get_outputs()]
  lam_all, alpha_all = out[names.index('lambda')], out[names.index('alpha')]  # [96, stations, 4]

  usable = [s for s in stations if s['id'] in index and s['id'] in assign]
  live = sorted([s for s in usable if active[s['id']]], key=lambda s: -s['trips'])
  pick = [live[0], live[len(live) // 10], live[len(live) // 2], live[len(live) * 9 // 10]]
  pick.append(next(s for s in live if s['id'] not in v2_ids))
  pick.append(next(s for s in sorted(usable, key=lambda s: -s['trips']) if not active[s['id']]))
  roles = ['busiest', 'top 10%', 'median', 'bottom 10%', 'new in v3, absent from v2', 'inactive']

  fixture = dict(date=date,
                 weekday=weekday,
                 holiday=holiday,
                 hourly=hourly,
                 clima=_r(clima, 6),
                 shocks={b: {
                     k: shocks[b][k]
                     for k in ('D', 'H', 'R', 'Ds', 'Hs')
                 }
                         for b in BIKES},
                 alpha_floor=ALPHA_FLOOR,
                 z80=Z_80,
                 stations={},
                 regions={})
  for s, role in zip(pick, roles):
    i = index[s['id']]
    lam, alpha = lam_all[:, i, :].astype(np.float64), alpha_all[:, i, :].astype(np.float64)
    day = station_day(lam, alpha, shocks)
    entry = dict(role=role, active=bool(active[s['id']]), index=i, lambda_=_r(lam, 6), alpha=_r(alpha, 6), bikes={})
    for bike, (dep, arr) in BIKES.items():
      entry['bikes'][bike] = dict(baseline=int(day[bike]['baseline']),
                                  stock=_r(day[bike]['stock'], 4),
                                  sigma=_r(day[bike]['sigma'], 4),
                                  stock_band=[list(stock_band(v, sg)) for v, sg in zip(day[bike]['stock'], day[bike]['sigma'])],
                                  departures=[list(flow_band(lam[t, dep], alpha[t, dep])) for t in range(SLOTS)],
                                  arrivals=[list(flow_band(lam[t, arr], alpha[t, arr])) for t in range(SLOTS)])
    fixture['stations'][s['id']] = entry

  counts = {}
  for sid, rid in assign.items():
    if sid in index and active[sid]:
      counts.setdefault(rid, []).append(sid)
  by_size = sorted(counts.items(), key=lambda kv: (-len(kv[1]), kv[0]))
  for rid, members in (by_size[0], by_size[len(by_size) // 2]):
    members = sorted(members, key=lambda sid: index[sid])
    idx = [index[sid] for sid in members]
    lam, alpha = lam_all[:, idx, :].transpose(1, 0, 2).astype(np.float64), alpha_all[:, idx, :].transpose(1, 0,
                                                                                                          2).astype(np.float64)
    st = group_stock(lam, alpha, shocks)
    entry = dict(stations=members, bikes={})
    for bike, (dep, arr) in BIKES.items():
      flows = {}
      for kind, ch in (('departures', dep), ('arrivals', arr)):
        mean_sd = [group_slot(lam[:, t, ch], alpha[:, t, ch], shocks, bike, kind) for t in range(SLOTS)]
        flows[kind] = dict(mean=_r([m for m, _ in mean_sd], 4),
                           sd=_r([s_ for _, s_ in mean_sd], 4),
                           band=[list(group_flow_band(m, s_)) for m, s_ in mean_sd])
      entry['bikes'][bike] = dict(baseline=int(st[bike]['baseline']),
                                  stock=_r(st[bike]['stock'], 4),
                                  sigma=_r(st[bike]['sigma'], 4),
                                  stock_band=[list(stock_band(v, sg)) for v, sg in zip(st[bike]['stock'], st[bike]['sigma'])],
                                  **flows)
    fixture['regions'][rid] = entry
  return fixture


if __name__ == '__main__':
  repo = Path(__file__).resolve().parent.parent
  target = repo / 'data/results/ui_reference_v3.json'
  days = []
  for date in ('2026-09-27', '2026-09-22'):  # the wettest day of the test block (49.8 mm) and a dry weekday
    fixture = build_fixture(repo, date)
    for entry in fixture['stations'].values():
      entry['lambda'] = entry.pop('lambda_')
    days.append(fixture)
  target.write_text(json.dumps(dict(model='demanda_net_v3.onnx', days=days), separators=(',', ':')) + '\n')
  print(f'wrote {target.relative_to(repo)}: {target.stat().st_size / 1e3:.0f} KB, {len(days)} days')

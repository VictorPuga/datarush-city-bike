"""Calibrated predictive intervals for station demand.

Each cell (station, 15-minute slot, target) is a negative binomial whose mean is the model rate.
The model's dispersion ``alpha_cell`` is the total over-dispersion of one cell.
Part of it is not independent noise but shocks shared by many cells (weather, events, a station being out of service):

    Y[s, t] | z ~ NB(mu[s, t] * z, alpha_idio)

where z is the product of five independent shocks per bike type, with variances

    D   city-wide, one per day          H   city-wide, one per hour of the day
    R   one per neighbourhood and day
    Ds  one per station and day         Hs  one per station and hour

and ``alpha_idio = alpha_cell - (D + H + R + Ds + Hs)``.
For any set of cells W inside one day, the total has mean M and variance

    V = sum(mu + alpha_idio mu^2) + D a_D + H a_H + R a_R + Ds a_Ds + Hs a_Hs

where a_D = M^2, a_H = sum over hours of M_h^2, a_R = sum over neighbourhoods of M_r^2,
a_Ds = sum over stations of M_s^2 and a_Hs = sum over station-hours of M_sh^2.
The interval is the negative binomial with that mean and variance.
The shock variances are fitted on held-out folds by non-negative least squares on the excess variance of six aggregation
families: station-hour, station-day, neighbourhood-hour, neighbourhood-day, city-hour and city-day.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import nnls

import citibike_eval as ce

BIKES = {'classic': (0, 2), 'electric': (1, 3)}  # (departure channel, arrival channel)
ALPHA_FLOOR = 0.01
SHOCKS = ('D', 'H', 'R', 'Ds', 'Hs')


def _hours(a):
  """[n, slots, k] -> [n, days, 24, 4, k]."""
  n, s, k = a.shape
  return a.reshape(n, s // ce.SLOTS_DIA, 24, 4, k)


def idio_alpha(alpha_cell, total_shock):
  return np.maximum(alpha_cell - total_shock, ALPHA_FLOOR)


def _onehot(labels):
  uniq, inv = np.unique(np.asarray(labels), return_inverse=True)
  g = np.zeros((len(uniq), len(inv)))
  g[inv, np.arange(len(inv))] = 1
  return g, uniq


def _gsum(x, onehot):
  """Sum over stations by group: x [n, ...] -> [groups, ...]. ``onehot`` None means every station is its own group."""
  if onehot is None:
    return x
  return (onehot @ x.reshape(x.shape[0], -1)).reshape((onehot.shape[0], ) + x.shape[1:])


class Windows:
  """Mean, noise variance, observed total and shock coefficients of every window of one series.

  ``kind`` 'hour' windows are (group, day, hour); 'day' windows are (group, day).
  Groups: ``groups`` labels per station (None = each station alone, 'city' = everybody).
  """

  def __init__(self, y_sh, m_sh, n_sh, region, groups):
    n = y_sh.shape[0]
    self.region = region
    if groups is None:
      self.G, self.pair = None, None
      lab = np.arange(n)
    elif isinstance(groups, str):
      lab = np.zeros(n, dtype=int)
      self.G = _onehot(lab)[0]
    else:
      lab = np.asarray(groups)
      self.G = _onehot(lab)[0]
    if groups is None:
      self.G = None
    # joint (group, region) membership for the neighbourhood shock
    _, lab_idx = np.unique(lab, return_inverse=True)
    _, reg_idx = np.unique(region, return_inverse=True)
    pair = lab_idx * (reg_idx.max() + 1) + reg_idx
    self.P, puniq = _onehot(pair)
    self.pair_group = puniq // (reg_idx.max() + 1)  # group index of every pair
    self.Gpair = np.zeros((lab_idx.max() + 1, len(puniq)))
    self.Gpair[self.pair_group, np.arange(len(puniq))] = 1
    # per-hour sums
    self.M_h, self.N_h, self.Y_h = (_gsum(a, self.G) for a in (m_sh, n_sh, y_sh))  # [groups, days, 24]
    MP_h = _gsum(m_sh, self.P)  # [pairs, days, 24]
    m2_h = _gsum(m_sh**2, self.G)  # sum over stations of M_sh^2
    m_sd = m_sh.sum(2)
    self.R_h = np.einsum('gp,pdh->gdh', self.Gpair, MP_h**2)
    self.S_h = m2_h
    self.M_d, self.N_d, self.Y_d = self.M_h.sum(2), self.N_h.sum(2), self.Y_h.sum(2)
    self.R_d = np.einsum('gp,pd->gd', self.Gpair, MP_h.sum(2)**2)
    self.S_d = _gsum(m_sd**2, self.G)
    self.H_d = (self.M_h**2).sum(2)
    self.Hs_d = m2_h.sum(2)

  def coefficients(self, kind):
    """a_D, a_H, a_R, a_Ds, a_Hs for hour or day windows."""
    if kind == 'hour':
      M2 = self.M_h**2
      return dict(D=M2, H=M2, R=self.R_h, Ds=self.S_h, Hs=self.S_h)
    M2 = self.M_d**2
    return dict(D=M2, H=self.H_d, R=self.R_d, Ds=self.S_d, Hs=self.Hs_d)

  def arrays(self, kind):
    return (self.M_h, self.N_h, self.Y_h) if kind == 'hour' else (self.M_d, self.N_d, self.Y_d)


def _series(Y, mu, al, full, ch, tot):
  mask = full[:, :, None, None]
  m = _hours(mu[..., ch:ch + 1])[..., 0].astype(np.float64) * mask
  a = idio_alpha(_hours(al[..., ch:ch + 1])[..., 0].astype(np.float64), tot) * mask
  y = _hours(Y[..., ch:ch + 1])[..., 0].astype(np.float64) * mask
  return y.sum(3), m.sum(3), (m + a * m**2).sum(3)


FAMILIES = (('station', 'hour'), ('station', 'day'), ('region', 'hour'), ('region', 'day'), ('city', 'hour'), ('city', 'day'))


def _group_arg(name, region):
  return {'station': None, 'city': 'city', 'region': region}[name]


def fit_shocks(blocks, region, iters=4):
  """Estimate the shock variances per bike type from held-out blocks.

  blocks: list of (Y, mu, alpha_cell, act) with arrays [n, slots, 4] and [n, slots]. region: neighbourhood label per station.
  """
  out = {}
  for bike, (dep, arr) in BIKES.items():
    sig = dict.fromkeys(SHOCKS, 0.0)
    for _ in range(iters):
      tot = sum(sig.values())
      acc = {f: dict(E=0.0, M2=0.0, M4=0.0, a=dict.fromkeys(SHOCKS, 0.0)) for f in FAMILIES}
      for Y, mu, al, act in blocks:
        full = act.reshape(act.shape[0], -1, ce.SLOTS_DIA).all(2)
        for ch in (dep, arr):
          y_sh, m_sh, n_sh = _series(Y, mu, al, full, ch, tot)
          for group, kind in FAMILIES:
            w = Windows(y_sh, m_sh, n_sh, region, _group_arg(group, region))
            M, N, Yo = w.arrays(kind)
            ok = M > 0
            a = acc[(group, kind)]
            a['E'] += float((((Yo - M)**2 - N)[ok]).sum())
            a['M2'] += float((M[ok]**2).sum())
            a['M4'] += float((M[ok]**4).sum())
            for k, v in w.coefficients(kind).items():
              a['a'][k] += float(v[ok].sum())
      A, r, wt = [], [], []
      for f in FAMILIES:
        a = acc[f]
        A.append([a['a'][k] / a['M2'] for k in SHOCKS])
        r.append(a['E'] / a['M2'])
        wt.append(np.sqrt(a['M2']**2 / a['M4']))  # square root of the effective number of windows
      A, r, wt = np.array(A), np.array(r), np.array(wt)
      sol, _ = nnls(A * wt[:, None], r * wt)
      sig = dict(zip(SHOCKS, sol.tolist()))
    sig['ratios'] = {f'{g}-{k}': float(r[i]) for i, (g, k) in enumerate(FAMILIES)}
    sig['fit_residual'] = {f'{g}-{k}': float(r[i] - A[i] @ sol) for i, (g, k) in enumerate(FAMILIES)}
    out[bike] = sig
  return out


def nb_alpha(M, V):
  return np.maximum((V - M) / np.maximum(M, 1e-9)**2, 1e-4)


def interval(M, V, level):
  """Central interval of a negative binomial with mean M and variance V."""
  alpha = nb_alpha(M, V)
  lo = ce.quantile_lookup(M, (1 - level) / 2, alpha)
  hi = ce.quantile_lookup(M, 1 - (1 - level) / 2, alpha)
  return lo, hi


def variance(w, kind, s):
  """Total variance of every window given shock variances ``s``."""
  M, N, _ = w.arrays(kind)
  return N + sum(s[k] * v for k, v in w.coefficients(kind).items())


def evaluate(Y, mu, al, act, shocks, region, groups=None, levels=(0.8, 0.9)):
  """Coverage, width and Winkler score for windows over stations, neighbourhoods, ``groups`` and the whole city."""
  groups = dict(groups or {})
  families = [('station', None), ('region', region), ('city', 'city')] + [(n, g) for n, g in groups.items()]
  full = act.reshape(act.shape[0], -1, ce.SLOTS_DIA).all(2)
  rows = []
  for bike, (dep, arr) in BIKES.items():
    s = shocks[bike]
    tot = sum(s[k] for k in SHOCKS)
    for flow, ch in (('departures', dep), ('arrivals', arr)):
      y_sh, m_sh, n_sh = _series(Y, mu, al, full, ch, tot)
      for name, g in families:
        w = Windows(y_sh, m_sh, n_sh, region, g)
        for kind in ('hour', 'day'):
          M, _, Yo = w.arrays(kind)
          V = variance(w, kind, s)
          ok = M > 0
          for level in levels:
            lo, hi = interval(M[ok], V[ok], level)
            rows.append(dict(bike=bike, flow=flow, group=name, window=kind, **ce.interval_metrics(Yo[ok], lo, hi, level)))
  return pd.DataFrame(rows)


def evaluate_cells(Y, mu, al, act, levels=(0.8, 0.9)):
  """Coverage of the per-cell negative binomial intervals (total dispersion), per target."""
  rows = []
  for k, t in enumerate(ce.TARGETS):
    y, m, a = Y[..., k][act].astype(np.float64), mu[..., k][act].astype(np.float64), al[..., k][act].astype(np.float64)
    for level in levels:
      lo = ce.quantile_lookup(m, (1 - level) / 2, a)
      hi = ce.quantile_lookup(m, 1 - (1 - level) / 2, a)
      rows.append(dict(target=t, **ce.interval_metrics(y, lo, hi, level)))
  return pd.DataFrame(rows)


def evaluate_net(Y, mu, al, act, shocks, levels=(0.8, 0.9), cut_hours=(6, 9, 12, 15, 18, 21)):
  """Coverage of arrivals minus departures per station-day, and of the cumulative net flow since midnight.

  Both flows share the shocks, so the shock terms use the net mean.  The interval is Gaussian with a continuity correction.
  """
  n = Y.shape[0]
  full = act.reshape(n, -1, ce.SLOTS_DIA).all(2)
  rows = []
  for bike, (dep, arr) in BIKES.items():
    s = shocks[bike]
    tot = sum(s[k] for k in SHOCKS)
    ya, ma, na = _series(Y, mu, al, full, arr, tot)
    yd, md, nd = _series(Y, mu, al, full, dep, tot)
    M_h, N_h, Y_h = ma - md, na + nd, ya - yd
    day_var, hour_var = s['D'] + s['R'] + s['Ds'], s['H'] + s['Hs']
    for label, cut in [('station-day net', 24)] + [(f'cumulative net to {h:02d}:00', h) for h in cut_hours]:
      M, N, Yo = M_h[:, :, :cut].sum(2), N_h[:, :, :cut].sum(2), Y_h[:, :, :cut].sum(2)
      V = N + day_var * M**2 + hour_var * (M_h[:, :, :cut]**2).sum(2)
      keep = full & (N > 0)
      sd = np.sqrt(V[keep])
      for level in levels:
        z = stats.norm.ppf(0.5 + level / 2)
        half = z * sd + 0.5
        rows.append(
            dict(bike=bike,
                 quantity=label,
                 level=level,
                 coverage=float((np.abs(Yo[keep] - M[keep]) <= half).mean()),
                 mean_width=float((2 * half).mean())))
  return pd.DataFrame(rows)

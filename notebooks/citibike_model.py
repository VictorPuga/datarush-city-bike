"""Factorised station x context demand model (v3), trained with a negative binomial likelihood.

For every station s, slot t and target c (departures and arrivals, classic and electric bikes):

    log mu[s, t, c] = b[s, c] + g0[t, c] + sum_r U[s, r, c] * G[t, r, c]

The context network (calendar and weather of the slot) produces g0 and G once per slot.
The station side (free embedding + neighbourhood embedding + coordinates) produces b and U.
Cost per training row is a dot product, not an MLP, so a full fit takes minutes on a CPU.

The variance is mu + alpha * mu**2 with log alpha = a[c] + k[c] * log mu + d[s, c].
"""
from __future__ import annotations

import copy
import math
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import torch
import torch.nn as nn

import citibike_eval as ce

SLOTS_DIA = ce.SLOTS_DIA
CONT_COLS = [
    'slot_sin', 'slot_cos', 'dow_sin', 'dow_cos', 'es_fin_semana', 'es_festivo', 'dia_libre', 'temperature_2m',
    'relative_humidity_2m', 'wind_speed_10m', 'precip_log', 'precip_prev_log', 'llueve'
]
SCALED = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'precip_log', 'precip_prev_log']
N_WC = 7

CFG = dict(
    rank=24,  # r: number of station x context factors per target
    d_station=32,  # station embedding size
    d_slot=16,
    d_dow=4,
    d_wc=4,
    d_daytype_slot=16,
    hidden=[256, 128],
    dropout=0.2,
    weather_noise=0.15,  # gaussian noise (in standard deviations) on scaled weather while training
    dist='nb',  # 'nb' or 'poisson'
    use_prior=True,  # add neighbourhood embedding and coordinates to the station embedding
    lr=2e-3,
    weight_decay=1e-2,
    station_decay=5e-2,
    slots_per_batch=96,
    epochs=16,
    warmup_steps=200,
    ema_decay=0.998,
    seed=ce.SEED,
)


def weather_group(wc):
  wc = np.nan_to_num(np.asarray(wc, dtype=float), nan=0)
  return np.select([wc <= 1, wc <= 3, wc <= 48, wc <= 67, wc <= 77, wc <= 86], [0, 1, 2, 3, 4, 5], default=6).astype(np.int64)


@dataclass
class Features:
  """Per-slot model inputs for the whole period (one row per 15-minute slot)."""
  xc: torch.Tensor  # [S, n_cont] float32, scaled
  slot: torch.Tensor  # [S] long, 0..95
  dow: torch.Tensor  # [S] long
  wc: torch.Tensor  # [S] long, weather group
  free: torch.Tensor  # [S] long, 1 on weekends and holidays
  idx_scaled: list = field(default_factory=list)
  mu: dict = field(default_factory=dict)
  sd: dict = field(default_factory=dict)


def build_features(data, d_train_end):
  """Calendar and weather features. Scaling statistics come from days before ``d_train_end`` only."""
  s = data.slots.copy()
  ts = pd.to_datetime(s['timestamp'])
  s['slot_sin'] = np.sin(2 * np.pi * s['slot_dia'] / SLOTS_DIA)
  s['slot_cos'] = np.cos(2 * np.pi * s['slot_dia'] / SLOTS_DIA)
  s['dow_sin'] = np.sin(2 * np.pi * s['dia_semana'] / 7)
  s['dow_cos'] = np.cos(2 * np.pi * s['dia_semana'] / 7)
  s['es_fin_semana'] = (s['dia_semana'] >= 5).astype(np.float32)
  s['dia_libre'] = np.maximum(s['es_fin_semana'], s['es_festivo']).astype(np.float32)
  s['precip_log'] = np.log1p(s['precipitation'].clip(lower=0))
  s['precip_prev_log'] = np.log1p(s['precip_prev2h'].clip(lower=0))
  s['llueve'] = (s['precipitation'] >= 0.1).astype(np.float32)
  n_fit = d_train_end * SLOTS_DIA
  mu = s.loc[:n_fit - 1, SCALED].mean()
  sd = s.loc[:n_fit - 1, SCALED].std().replace(0, 1).fillna(1)
  x = s[CONT_COLS].astype(np.float32).copy()
  x[SCALED] = (x[SCALED] - mu[SCALED].values) / sd[SCALED].values
  return Features(torch.tensor(x.values, dtype=torch.float32), torch.tensor(s['slot_dia'].values, dtype=torch.long),
                  torch.tensor(s['dia_semana'].values, dtype=torch.long),
                  torch.tensor(weather_group(s['weather_code']), dtype=torch.long),
                  torch.tensor(s['dia_libre'].values, dtype=torch.long), [CONT_COLS.index(c) for c in SCALED], mu.to_dict(),
                  sd.to_dict())


def station_inputs(data, repo_root):
  """Region index and standardised coordinates of every station (the neighbourhood prior)."""
  reg = ce.load_regions(repo_root, data.est)
  codes, uniques = pd.factorize(reg['nta_id'])
  lat, lng = data.est['lat'].values, data.est['lng'].values
  geo = np.stack([(lat - lat.mean()) / lat.std(), (lng - lng.mean()) / lng.std()], axis=1).astype(np.float32)
  return torch.tensor(codes + 1, dtype=torch.long), torch.tensor(geo), len(uniques) + 1, list(uniques)


class DemandV3(nn.Module):

  def __init__(self, n_est, n_cont, n_region, region_of, geo, cfg, init_log_rate):
    super().__init__()
    self.cfg = cfg
    R, d = cfg['rank'], cfg['d_station']
    self.register_buffer('region_of', region_of)
    self.register_buffer('geo', geo)
    self.register_buffer('idx_scaled', torch.zeros(0, dtype=torch.long), persistent=False)
    self.emb_station = nn.Embedding(n_est, d)
    self.emb_region = nn.Embedding(n_region, d)
    self.geo_net = nn.Sequential(nn.Linear(2, 16), nn.GELU(), nn.Linear(16, d))
    self.to_u = nn.Linear(d, R * 4)
    self.to_b = nn.Linear(d, 4)
    self.bias_station = nn.Embedding(n_est, 4)
    self.emb_slot = nn.Embedding(SLOTS_DIA, cfg['d_slot'])
    self.emb_dow = nn.Embedding(7, cfg['d_dow'])
    self.emb_wc = nn.Embedding(N_WC, cfg['d_wc'])
    self.emb_dts = nn.Embedding(2 * SLOTS_DIA, cfg['d_daytype_slot'])
    dim = cfg['d_slot'] + cfg['d_dow'] + cfg['d_wc'] + cfg['d_daytype_slot'] + n_cont
    layers = []
    for h in cfg['hidden']:
      layers += [nn.Linear(dim, h), nn.LayerNorm(h), nn.GELU(), nn.Dropout(cfg['dropout'])]
      dim = h
    self.mlp = nn.Sequential(*layers)
    self.out = nn.Linear(dim, (R + 1) * 4)
    self.alpha_a = nn.Parameter(torch.full((4, ), math.log(0.3)))
    self.alpha_k = nn.Parameter(torch.full((4, ), -0.3))
    self.alpha_d = nn.Embedding(n_est, 4)
    for e in (self.emb_station, self.emb_region, self.emb_slot, self.emb_dow, self.emb_wc, self.emb_dts):
      nn.init.normal_(e.weight, std=0.05)
    nn.init.zeros_(self.bias_station.weight)
    nn.init.zeros_(self.alpha_d.weight)
    nn.init.normal_(self.to_u.weight, std=0.05)
    nn.init.zeros_(self.to_u.bias)
    nn.init.zeros_(self.to_b.weight)
    with torch.no_grad():
      self.to_b.bias.copy_(init_log_rate)
      self.out.weight.mul_(0.1)
      self.out.bias.zero_()

  def station_side(self):
    e = self.emb_station.weight
    if self.cfg.get('use_prior', True):
      e = e + self.emb_region(self.region_of) + self.geo_net(self.geo)
    n = e.shape[0]
    u = self.to_u(e).view(n, self.cfg['rank'], 4)
    b = self.to_b(e) + self.bias_station.weight
    return u, b

  def context(self, xc, slot, dow, wc, free):
    if self.training and self.cfg['weather_noise'] > 0:
      noise = torch.zeros_like(xc)
      noise[:, self.idx_scaled] = torch.randn(xc.shape[0], len(self.idx_scaled)) * self.cfg['weather_noise']
      xc = xc + noise
    z = torch.cat([self.emb_slot(slot), self.emb_dow(dow), self.emb_wc(wc), self.emb_dts(free * SLOTS_DIA + slot), xc], dim=1)
    g = self.out(self.mlp(z)).view(-1, self.cfg['rank'] + 1, 4)
    return g[:, 0], g[:, 1:]

  def log_mu(self, xc, slot, dow, wc, free, station_side=None):
    u, b = station_side if station_side is not None else self.station_side()
    g0, g = self.context(xc, slot, dow, wc, free)
    lm = b[None] + g0[:, None] + torch.einsum('nrc,brc->bnc', u, g)
    return lm.clamp(-15, 10)

  def log_alpha(self, lm):
    return (self.alpha_a + self.alpha_k * lm + self.alpha_d.weight[None]).clamp(-6, 3)


def nb_nll(y, lm, la):
  mu, r = lm.exp(), (-la).exp()
  return -(torch.lgamma(y + r) - torch.lgamma(r) - torch.lgamma(y + 1) + r * (torch.log(r) - torch.log(r + mu)) + y *
           (lm - torch.log(r + mu)))


def poisson_nll(y, lm):
  return lm.exp() - y * lm


class Dataset:
  """Dense tensors laid out [slot, station, target] so that a batch of slots is a contiguous read."""

  def __init__(self, data):
    self.Y = torch.from_numpy(np.ascontiguousarray(np.transpose(np.asarray(data.Y), (1, 0, 2))))
    self.act = torch.from_numpy(np.ascontiguousarray(np.asarray(data.act).T))
    self.n_est = data.n_est


class EMA:

  def __init__(self, model, decay):
    self.module = copy.deepcopy(model).eval()
    for p in self.module.parameters():
      p.requires_grad_(False)
    self.decay, self.n = decay, 0

  @torch.no_grad()
  def update(self, model):
    self.n += 1
    d = min(self.decay, (1 + self.n) / (10 + self.n))
    for pe, pm in zip(self.module.parameters(), model.parameters()):
      pe.lerp_(pm.detach(), 1 - d)


def loss_on(model, ds, feats, slots, cfg, train):
  model.train(train)
  xc, sl, dw, wc, fr = feats.xc[slots], feats.slot[slots], feats.dow[slots], feats.wc[slots], feats.free[slots]
  lm = model.log_mu(xc, sl, dw, wc, fr)
  y = ds.Y[slots].float()
  m = ds.act[slots][:, :, None].float()
  if cfg['dist'] == 'nb':
    nll = nb_nll(y, lm, model.log_alpha(lm))
  else:
    nll = poisson_nll(y, lm)
  return (nll * m).sum() / (m.sum() * 4)


def fit(data, ds, feats, st_inputs, d0, d1, cfg=None, val_range=None, log=print):
  """Fit on days d0..d1 (half open). ``val_range`` = (d0, d1) of a block to monitor, never used to stop training."""
  cfg = {**CFG, **(cfg or {})}
  torch.manual_seed(cfg['seed'])
  np.random.seed(cfg['seed'])
  region_of, geo, n_region, _ = st_inputs
  lo, hi = d0 * SLOTS_DIA, d1 * SLOTS_DIA
  y = ds.Y[lo:hi].float()
  a = ds.act[lo:hi]
  glob = (y * a[:, :, None]).sum((0, 1)) / a.sum()
  init = torch.log(glob.clamp(min=1e-3))
  del y
  model = DemandV3(ds.n_est, len(CONT_COLS), n_region, region_of, geo, cfg, init)
  model.idx_scaled = torch.tensor(feats.idx_scaled, dtype=torch.long)
  station_params = [p for n, p in model.named_parameters() if n.startswith(('emb_station', 'bias_station', 'alpha_d'))]
  other = [p for n, p in model.named_parameters() if not n.startswith(('emb_station', 'bias_station', 'alpha_d')) and p.ndim >= 2]
  nodecay = [
      p for n, p in model.named_parameters() if not n.startswith(('emb_station', 'bias_station', 'alpha_d')) and p.ndim < 2
  ]
  opt = torch.optim.AdamW([{
      'params': station_params,
      'weight_decay': cfg['station_decay']
  }, {
      'params': other,
      'weight_decay': cfg['weight_decay']
  }, {
      'params': nodecay,
      'weight_decay': 0.0
  }],
                          lr=cfg['lr'])
  slots_all = np.arange(lo, hi)
  # slots with at least one active station
  slots_all = slots_all[ds.act[lo:hi].any(1).numpy()]
  B = cfg['slots_per_batch']
  steps_epoch = math.ceil(len(slots_all) / B)
  total = steps_epoch * cfg['epochs']

  def lr_factor(step):
    if step < cfg['warmup_steps']:
      return (step + 1) / cfg['warmup_steps']
    p = (step - cfg['warmup_steps']) / max(1, total - cfg['warmup_steps'])
    return 0.03 + 0.97 * 0.5 * (1 + math.cos(math.pi * min(p, 1.0)))

  sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_factor)
  ema = EMA(model, cfg['ema_decay'])
  ema.module.idx_scaled = model.idx_scaled
  hist = []
  rng = np.random.default_rng(cfg['seed'])
  step = 0
  for epoch in range(1, cfg['epochs'] + 1):
    t0 = time.time()
    order = rng.permutation(slots_all)
    run, nb = 0.0, 0
    for i in range(0, len(order), B):
      idx = torch.from_numpy(np.sort(order[i:i + B]))
      loss = loss_on(model, ds, feats, idx, cfg, True)
      opt.zero_grad(set_to_none=True)
      loss.backward()
      nn.utils.clip_grad_norm_(model.parameters(), 1.0)
      opt.step()
      sched.step()
      ema.update(model)
      run += loss.item()
      nb += 1
      step += 1
    row = dict(epoch=epoch, train=run / nb, seconds=time.time() - t0)
    if val_range is not None:
      row['val_ema'] = evaluate_loss(ema.module, ds, feats, val_range, cfg)
    hist.append(row)
    log(' '.join(f'{k}={v:.4f}' if isinstance(v, float) else f'{k}={v}' for k, v in row.items()))
  return ema.module, hist, cfg


@torch.no_grad()
def evaluate_loss(model, ds, feats, rng_days, cfg, batch=192):
  model.eval()
  lo, hi = rng_days[0] * SLOTS_DIA, rng_days[1] * SLOTS_DIA
  side = model.station_side()
  tot, n = 0.0, 0.0
  for i in range(lo, hi, batch):
    slots = torch.arange(i, min(i + batch, hi))
    xc, sl, dw, wc, fr = feats.xc[slots], feats.slot[slots], feats.dow[slots], feats.wc[slots], feats.free[slots]
    lm = model.log_mu(xc, sl, dw, wc, fr, side)
    y = ds.Y[slots].float()
    m = ds.act[slots][:, :, None].float()
    nll = nb_nll(y, lm, model.log_alpha(lm)) if cfg['dist'] == 'nb' else poisson_nll(y, lm)
    tot += float((nll * m).sum())
    n += float(m.sum() * 4)
  return tot / n


@torch.no_grad()
def predict(model, feats, block, batch=192):
  """Expected counts and dispersion for a block: arrays [n_est, n_slots, 4]."""
  model.eval()
  side = model.station_side()
  mus, als = [], []
  for i in range(block.s0, block.s1, batch):
    slots = torch.arange(i, min(i + batch, block.s1))
    lm = model.log_mu(feats.xc[slots], feats.slot[slots], feats.dow[slots], feats.wc[slots], feats.free[slots], side)
    mus.append(lm.exp().numpy())
    als.append(model.log_alpha(lm).exp().numpy())
  mu = np.concatenate(mus).transpose(1, 0, 2)
  al = np.concatenate(als).transpose(1, 0, 2)
  return np.ascontiguousarray(mu, dtype=np.float32), np.ascontiguousarray(al, dtype=np.float32)


class DemandV3ONNX(nn.Module):
  """All preprocessing and all stations in one graph, same inputs as the v2 model.

  Inputs: slot_dia int64 [S], dia_semana int64 [S], es_festivo float32 [S],
  clima float32 [S, 6] = temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation, precip_prev2h, weather_code.
  Outputs: lambda float32 [S, n_stations, 4] (expected bikes per 15 minutes, the v2 contract) and
  alpha float32 [S, n_stations, 4] (negative binomial dispersion of one cell).
  """

  def __init__(self, model, mu, sd):
    super().__init__()
    self.model = model.eval()
    mean, std = torch.zeros(len(CONT_COLS)), torch.ones(len(CONT_COLS))
    for c in SCALED:
      mean[CONT_COLS.index(c)] = float(mu[c])
      std[CONT_COLS.index(c)] = float(sd[c])
    self.register_buffer('mean', mean)
    self.register_buffer('std', std)
    self.register_buffer('wc_limits', torch.tensor([1., 3., 48., 67., 77., 86.]))

  def forward(self, slot_dia, dia_semana, es_festivo, clima):
    s, w = slot_dia.to(torch.float32), dia_semana.to(torch.float32)
    temp, hum, wind = clima[:, 0], clima[:, 1], clima[:, 2]
    precip, prev, wcode = clima[:, 3].clamp(min=0), clima[:, 4].clamp(min=0), clima[:, 5]
    weekend = (dia_semana >= 5).to(torch.float32)
    free = torch.maximum(weekend, es_festivo)
    cols = {
        'slot_sin': torch.sin(2 * math.pi * s / SLOTS_DIA),
        'slot_cos': torch.cos(2 * math.pi * s / SLOTS_DIA),
        'dow_sin': torch.sin(2 * math.pi * w / 7),
        'dow_cos': torch.cos(2 * math.pi * w / 7),
        'es_fin_semana': weekend,
        'es_festivo': es_festivo,
        'dia_libre': free,
        'temperature_2m': temp,
        'relative_humidity_2m': hum,
        'wind_speed_10m': wind,
        'precip_log': torch.log1p(precip),
        'precip_prev_log': torch.log1p(prev),
        'llueve': (precip >= 0.1).to(torch.float32)
    }
    xc = (torch.stack([cols[c] for c in CONT_COLS], dim=1) - self.mean) / self.std
    wc = (wcode.unsqueeze(1) > self.wc_limits).to(torch.long).sum(dim=1)
    lm = self.model.log_mu(xc, slot_dia, dia_semana, wc, free.to(torch.long))
    return torch.exp(lm), torch.exp(self.model.log_alpha(lm))


def export_onnx(model, mu, sd, path, example):
  """Export to ONNX with a dynamic number of slots. ``example`` = the four input tensors."""
  wrapper = DemandV3ONNX(model, mu, sd).eval()
  names = ['slot_dia', 'dia_semana', 'es_festivo', 'clima']
  try:
    dim = torch.export.Dim('S', min=1, max=100_000)
    prog = torch.onnx.export(wrapper,
                             example,
                             dynamo=True,
                             input_names=names,
                             output_names=['lambda', 'alpha'],
                             dynamic_shapes={n: {
                                 0: dim
                             }
                                             for n in names})
    prog.save(str(path), external_data=False)
    return 'torch.export (dynamo)'
  except Exception as e:  # fall back to the TorchScript exporter
    torch.onnx.export(wrapper,
                      example,
                      str(path),
                      dynamo=False,
                      opset_version=17,
                      input_names=names,
                      output_names=['lambda', 'alpha'],
                      dynamic_axes={n: {
                          0: 'S'
                      }
                                    for n in names} | {
                                        'lambda': {
                                            0: 'S'
                                        },
                                        'alpha': {
                                            0: 'S'
                                        }
                                    })
    return f'TorchScript ({type(e).__name__})'


def build_model(ds, st_inputs, cfg, feats):
  """An untrained model with the right shapes (used to load a checkpoint)."""
  region_of, geo, n_region, _ = st_inputs
  model = DemandV3(ds.n_est, len(CONT_COLS), n_region, region_of, geo, {**CFG, **cfg}, torch.zeros(4))
  model.idx_scaled = torch.tensor(feats.idx_scaled, dtype=torch.long)
  return model


def fit_cached(data, ds, st_inputs, d0, d1, cfg, path, log=print):
  """Fit on days d0..d1 (half open) and save to ``path``, or load the checkpoint when it exists.

  Returns (model, features). Feature scaling uses only days before d1.
  """
  from pathlib import Path
  path = Path(path)
  feats = build_features(data, d1)
  if path.exists():
    ckpt = torch.load(path, weights_only=False)
    model = build_model(ds, st_inputs, ckpt['cfg'], feats)
    model.load_state_dict(ckpt['state'])
    model.eval()
    log(f'loaded {path.name}')
    return model, feats
  model, hist, full_cfg = fit(data, ds, feats, st_inputs, d0, d1, cfg=cfg, log=log)
  path.parent.mkdir(parents=True, exist_ok=True)
  torch.save({'state': model.state_dict(), 'cfg': full_cfg, 'history': hist, 'days': (d0, d1)}, path)
  return model, feats

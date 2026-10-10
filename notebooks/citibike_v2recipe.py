"""The v2 network recipe (MODELO_pytorch.ipynb) retrained on the 12-month table, as a like-for-like reference.

Same architecture, features, loss (Poisson), optimiser, EMA and regularisation as v2.
Only the data loop differs: with 80 million rows an epoch would take about 8 minutes on a CPU, so each step draws
16,384 random (station, slot) pairs from the active cells, for the same number of steps v2 took (14 epochs x 882 steps).
"""
from __future__ import annotations

import copy
import math
import time

import numpy as np
import torch
import torch.nn as nn

import citibike_eval as ce
import citibike_model as cm

SLOTS_DIA = ce.SLOTS_DIA
V2_CFG = dict(emb_station=32,
              emb_slot=16,
              emb_dow=4,
              emb_wc=4,
              profile_rank=16,
              hidden=[256, 128],
              dropout=0.25,
              dropout_emb=0.10,
              weather_noise=0.15,
              lr=1e-3,
              weight_decay=1e-2,
              batch=16384,
              steps=12348,
              warmup=882,
              ema=0.999,
              seed=ce.SEED)


class DemandaNet(nn.Module):
  """v2 architecture: station, slot, weekday and weather-group embeddings, an MLP, and a factorised daily profile."""

  def __init__(self, n_est, n_cont, cfg, mean_targets, idx_scaled):
    super().__init__()
    self.cfg = cfg
    self.register_buffer('idx_scaled', torch.tensor(idx_scaled, dtype=torch.long), persistent=False)
    self.emb_est = nn.Embedding(n_est, cfg['emb_station'])
    self.emb_slot = nn.Embedding(SLOTS_DIA, cfg['emb_slot'])
    self.emb_dow = nn.Embedding(7, cfg['emb_dow'])
    self.emb_wc = nn.Embedding(cm.N_WC, cfg['emb_wc'])
    self.bias_est = nn.Embedding(n_est, 4)
    R = cfg['profile_rank']
    self.profile_est = nn.Embedding(n_est, 4 * R)
    self.profile_t = nn.Embedding(2 * SLOTS_DIA, 4 * R)
    nn.init.zeros_(self.bias_est.weight)
    for e in (self.emb_est, self.emb_slot, self.emb_dow, self.emb_wc):
      nn.init.normal_(e.weight, std=0.05)
    nn.init.normal_(self.profile_est.weight, std=0.1)
    nn.init.normal_(self.profile_t.weight, std=0.1)
    dim = cfg['emb_station'] + cfg['emb_slot'] + cfg['emb_dow'] + cfg['emb_wc'] + n_cont
    self.drop_emb = nn.Dropout(cfg['dropout_emb'])
    layers = []
    for h in cfg['hidden']:
      layers += [nn.Linear(dim, h), nn.LayerNorm(h), nn.GELU(), nn.Dropout(cfg['dropout'])]
      dim = h
    self.mlp = nn.Sequential(*layers)
    self.out = nn.Linear(dim, 4)
    with torch.no_grad():
      self.out.weight.mul_(0.1)
      self.out.bias.copy_(torch.log(mean_targets.clamp(min=1e-4)))

  def forward(self, est, slot, dow, wc, xc, free):
    if self.training and self.cfg['weather_noise'] > 0:
      noise = torch.zeros_like(xc)
      noise[:, self.idx_scaled] = torch.randn(xc.shape[0], len(self.idx_scaled)) * self.cfg['weather_noise']
      xc = xc + noise
    z = torch.cat([self.emb_est(est), self.emb_slot(slot), self.emb_dow(dow), self.emb_wc(wc), xc], dim=1)
    R = self.cfg['profile_rank']
    u = self.profile_est(est).view(-1, 4, R)
    v = self.profile_t(free * SLOTS_DIA + slot).view(-1, 4, R)
    return (self.out(self.mlp(self.drop_emb(z))) + (u * v).sum(-1) + self.bias_est(est)).clamp(-15, 10)


def fit_v2(ds, feats, d0, d1, cfg=None, log=print, every=1000):
  cfg = {**V2_CFG, **(cfg or {})}
  torch.manual_seed(cfg['seed'])
  rng = np.random.default_rng(cfg['seed'])
  lo, hi, n = d0 * SLOTS_DIA, d1 * SLOTS_DIA, ds.n_est
  y = ds.Y[lo:hi].float()
  a = ds.act[lo:hi]
  mean_t = (y * a[:, :, None]).sum((0, 1)) / a.sum()
  del y
  model = DemandaNet(n, len(cm.CONT_COLS), cfg, mean_t, feats.idx_scaled)
  decay = [p for nme, p in model.named_parameters() if p.ndim >= 2 and 'bias_est' not in nme and 'norm' not in nme.lower()]
  nodecay = [
      p for nme, p in model.named_parameters() if not (p.ndim >= 2 and 'bias_est' not in nme and 'norm' not in nme.lower())
  ]
  opt = torch.optim.AdamW([{
      'params': decay,
      'weight_decay': cfg['weight_decay']
  }, {
      'params': nodecay,
      'weight_decay': 0.0
  }],
                          lr=cfg['lr'])
  total, warm = cfg['steps'], cfg['warmup']

  def factor(step):
    if step < warm:
      return (step + 1) / warm
    p = (step - warm) / max(1, total - warm)
    return 0.05 + 0.95 * 0.5 * (1 + math.cos(math.pi * min(p, 1.0)))

  sched = torch.optim.lr_scheduler.LambdaLR(opt, factor)
  ema = copy.deepcopy(model).eval()
  for p in ema.parameters():
    p.requires_grad_(False)
  crit = nn.PoissonNLLLoss(log_input=True, full=False)
  model.train()
  run, nb, t0 = 0.0, 0, time.time()
  for step in range(total):
    t = torch.from_numpy(rng.integers(lo, hi, size=cfg['batch']))
    s = torch.from_numpy(rng.integers(0, n, size=cfg['batch']))
    keep = ds.act[t, s]
    t, s = t[keep], s[keep]
    out = model(s, feats.slot[t], feats.dow[t], feats.wc[t], feats.xc[t], feats.free[t])
    loss = crit(out, ds.Y[t, s].float())
    opt.zero_grad(set_to_none=True)
    loss.backward()
    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    sched.step()
    d = min(cfg['ema'], (1 + step + 1) / (10 + step + 1))
    with torch.no_grad():
      for pe, pm in zip(ema.parameters(), model.parameters()):
        pe.lerp_(pm.detach(), 1 - d)
    run += loss.item()
    nb += 1
    if (step + 1) % every == 0:
      log(f'step {step + 1}/{total} train={run / nb:.4f} {time.time() - t0:.0f}s')
      run, nb = 0.0, 0
  return ema.eval(), cfg


@torch.no_grad()
def predict_v2(model, feats, block, chunk=8):
  """Expected counts for a block: [n_est, n_slots, 4]."""
  model.eval()
  n = model.emb_est.num_embeddings
  out = []
  est = torch.arange(n)
  for i in range(block.s0, block.s1, chunk):
    sl = torch.arange(i, min(i + chunk, block.s1))
    k = len(sl)
    rep = lambda x: x[sl].repeat_interleave(n, dim=0)
    lm = model(est.repeat(k), rep(feats.slot), rep(feats.dow), rep(feats.wc), rep(feats.xc), rep(feats.free))
    out.append(lm.exp().view(k, n, 4).numpy())
  return np.ascontiguousarray(np.concatenate(out).transpose(1, 0, 2), dtype=np.float32)

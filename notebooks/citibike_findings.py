"""Descriptive analysis behind docs/findings.md.

``rider_mix`` re-reads the raw monthly trip files with exactly the filters of ``LIMPIEZA_citibike.ipynb`` and counts
departures by rider type (member or casual) and bike type, which the demand tables of the model do not keep.
Its total must equal the number of clean trips of that notebook, so the findings and the model describe the same trips.
Run ``python citibike_findings.py`` from ``notebooks/`` to build the cache in ``tmp/findings/``.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

BBOX = dict(lat_min=40.45, lat_max=41.00, lng_min=-74.30, lng_max=-73.65)
MAX_DURATION_H = 24
BIKE_TYPES = ['classic_bike', 'electric_bike']
TEST_STATIONS = r'(?:\btest\b|lab - nyc|workshop|\bmobile\b|nycbs depot|warehouse|\bdepot\b)'
COLUMNS = [
    'ride_id', 'rideable_type', 'started_at', 'ended_at', 'start_station_name', 'start_station_id', 'end_station_name',
    'end_station_id', 'start_lat', 'start_lng', 'end_lat', 'end_lng', 'member_casual'
]
TEXT = [c for c in COLUMNS if c not in ('start_lat', 'start_lng', 'end_lat', 'end_lng')]
DTYPES = {c: 'string[pyarrow]' for c in TEXT}
DTYPES.update({c: 'float32' for c in ['start_lat', 'start_lng', 'end_lat', 'end_lng']})


def rider_mix(trips_dir, processed_dir, cache_dir, log=print):
  """Departures by station, day type, hour, rider type and bike type, and by day, hour, rider type and bike type.

  Returns (station table, city table, clean trip count). Both tables have ``n`` trips and ``member``, ``electric`` flags.
  """
  cache = Path(cache_dir)
  f_station, f_city, f_meta = cache / 'rider_mix_station.parquet', cache / 'rider_mix_city.parquet', cache / 'rider_mix.json'
  if f_station.exists() and f_city.exists() and f_meta.exists():
    return pd.read_parquet(f_station), pd.read_parquet(f_city), json.loads(f_meta.read_text())['clean_trips']

  meta = json.loads((Path(processed_dir) / 'metadata.json').read_text())
  start, end = pd.Timestamp(meta['inicio']), pd.Timestamp(meta['fin'])
  slots = pd.read_parquet(Path(processed_dir) / 'slots.parquet', columns=['fecha', 'dia_libre'])
  free_of_day = slots.groupby('fecha')['dia_libre'].first().to_numpy().astype(np.int8)  # 1 = weekend or holiday
  files = sorted(Path(trips_dir).glob('*-citibike-tripdata/*-citibike-tripdata*.csv'))
  assert files, f'no trip files in {trips_dir}'

  vocab = pd.Index([], dtype='string[pyarrow]')
  parts = []
  t_all = time.time()
  for f in files:
    t0 = time.time()
    d = pd.read_csv(f, usecols=COLUMNS, dtype=DTYPES)
    for c in TEXT:
      d[c] = d[c].str.strip().replace('', pd.NA)
    for c in ['started_at', 'ended_at']:
      d[c] = pd.to_datetime(d[c], format='ISO8601', errors='coerce')
    d = d.loc[~d.isna().any(axis=1)]
    d = d[d['rideable_type'].isin(BIKE_TYPES)]
    dur = (d['ended_at'] - d['started_at']).dt.total_seconds().to_numpy()
    m = dur > 0
    d, dur = d[m], dur[m]
    d = d[dur <= MAX_DURATION_H * 3600]
    inside = (d['start_lat'].between(BBOX['lat_min'], BBOX['lat_max']) & d['end_lat'].between(BBOX['lat_min'], BBOX['lat_max'])
              & d['start_lng'].between(BBOX['lng_min'], BBOX['lng_max']) & d['end_lng'].between(BBOX['lng_min'], BBOX['lng_max']))
    d = d[inside.to_numpy()]
    test_start = d['start_station_name'].str.contains(TEST_STATIONS, case=False, regex=True).fillna(False).to_numpy(bool)
    test_end = d['end_station_name'].str.contains(TEST_STATIONS, case=False, regex=True).fillna(False).to_numpy(bool)
    d = d[~(test_start | test_end)]
    d = d[(d['started_at'] >= start) & (d['started_at'] < end)]
    cat = pd.Categorical(d['start_station_id'])
    new = cat.categories.difference(vocab)
    if len(new):
      vocab = vocab.append(new)
    parts.append(
        dict(sid=vocab.get_indexer(cat.categories)[cat.codes].astype(np.int32),
             day=(d['started_at'].dt.normalize() - start).dt.days.to_numpy().astype(np.int16),
             hour=d['started_at'].dt.hour.to_numpy().astype(np.int8),
             member=(d['member_casual'] == 'member').to_numpy().astype(np.int8),
             electric=(d['rideable_type'] == 'electric_bike').to_numpy().astype(np.int8),
             hash=pd.util.hash_pandas_object(d['ride_id'], index=False).to_numpy()))
    log(f'{f.name}: {len(d):>10,} clean rows ({time.time() - t0:.0f}s)')
    del d
  A = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
  del parts
  keep = ~pd.Series(A['hash']).duplicated().to_numpy()
  A = {k: v[keep] for k, v in A.items() if k != 'hash'}
  n = len(A['sid'])
  log(f'{n:,} clean trips after removing duplicate ride ids ({time.time() - t_all:.0f}s)')

  n_sid, n_days = len(vocab), len(free_of_day)
  rider = A['member'].astype(np.int64) * 2 + A['electric']
  free = free_of_day[A['day']].astype(np.int64)
  key = ((A['sid'].astype(np.int64) * 2 + free) * 24 + A['hour']) * 4 + rider
  counts = np.bincount(key, minlength=n_sid * 2 * 24 * 4).reshape(n_sid, 2, 24, 2, 2)
  s_idx = np.indices(counts.shape)
  station = pd.DataFrame({
      'station_id': np.asarray(vocab.astype(str))[s_idx[0].ravel()],
      'free': s_idx[1].ravel(),
      'hour': s_idx[2].ravel(),
      'member': s_idx[3].ravel(),
      'electric': s_idx[4].ravel(),
      'n': counts.ravel()
  })
  station = station[station['n'] > 0].reset_index(drop=True)
  key = (A['day'].astype(np.int64) * 24 + A['hour']) * 4 + rider
  counts = np.bincount(key, minlength=n_days * 24 * 4).reshape(n_days, 24, 2, 2)
  c_idx = np.indices(counts.shape)
  city = pd.DataFrame({
      'day': c_idx[0].ravel(),
      'hour': c_idx[1].ravel(),
      'member': c_idx[2].ravel(),
      'electric': c_idx[3].ravel(),
      'n': counts.ravel()
  })
  cache.mkdir(parents=True, exist_ok=True)
  station.to_parquet(f_station, index=False)
  city.to_parquet(f_city, index=False)
  f_meta.write_text(json.dumps(dict(clean_trips=int(n))))
  return station, city, int(n)


if __name__ == '__main__':
  here = Path(__file__).resolve().parent
  station, city, n = rider_mix(here, here / 'data_procesada', here.parent / 'tmp' / 'findings')
  print(n, station['n'].sum(), city['n'].sum())

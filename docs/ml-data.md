# Training data

`notebooks/LIMPIEZA_citibike.ipynb` turns the raw Citi Bike trip files into the station by 15-minute table that the demand model is trained and evaluated on.
This page covers what it reads, what it does, how to run it and what it writes.

## Inputs

- One zip per month in `data/raw/`, for example `202609-citibike-tripdata.zip`.
  The model now uses 12 consecutive months, Oct 2025 to Sep 2026.
- The notebook extracts each zip into `notebooks/YYYYMM-citibike-tripdata/` when that folder is missing.
  Extracted CSV files are gitignored.
- CSV names can end in `_1.csv` or in `-part1.csv` (April 2026 uses the second form).
- The months must be consecutive.
  The notebook stops if one is missing, because the calendar is continuous and a missing month would count as zero demand at every station.
- Hourly weather from the Open-Meteo archive API for New York City, cached in `notebooks/data_procesada/clima_horario_raw.parquet`.

When months are added, only the missing weather range is downloaded and the cached values are kept, so the weather already used for training never changes.

## Run

```sh
cd notebooks
jupyter lab LIMPIEZA_citibike.ipynb
```

It takes about 3 minutes and peaks at about 6 GB of memory for 12 months.
It needs network access only to download weather for months that are not cached yet.
Install `notebooks/requirements.txt` first.

## What it does

Each trip file is cleaned on its own, with the same steps as before, and only a compact record is kept (about 25 bytes per trip).
This is what lets 45 million trips fit in memory, where a single DataFrame did not.

1. Drop rows with a null or empty field.
2. Keep classic and electric bikes only.
3. Keep trips with a positive duration of at most 24 hours.
4. Keep trips whose start and end are inside the New York bounding box.
5. Drop service stations such as `Lab - NYC - M`.
6. Keep trips that start inside the period.
7. Drop repeated `ride_id` values across files, using a 64-bit hash.
8. Round start and end times down to 15 minutes, 96 slots per day.
9. Build the station catalog: stations with at least 100 trips, the most frequent name, and the median of the monthly median coordinates.
10. Count departures and arrivals per station, slot and bike type.
11. Keep each station only from its first to its last active day, so stations that opened or closed mid-period do not add false zeros.
12. Add calendar features and weather at 15 minutes, with rain shifted one hour as Open-Meteo reports it at the end of each hour.

`es_festivo` is 1 on US federal holidays and their observed weekdays only.
It does not use the New York state list of the `holidays` library, which adds Election Day, Lincoln's Birthday and Susan B. Anthony Day.
The dashboard (`ui/src/lib/calendar.ts`) marks the federal days only, so training and serving agree.

## Output

All files are in `notebooks/data_procesada/` and are gitignored.

| File | Content |
| --- | --- |
| `demanda_15min.parquet` | One row per station and active slot: `station_idx`, `slot_idx`, the four targets (`salidas_classic`, `salidas_electric`, `llegadas_classic`, `llegadas_electric`) and the two totals |
| `estaciones.parquet` | Station catalog sorted by activity, with `station_idx`, `station_id`, name, coordinates, trip totals and first and last active day |
| `slots.parquet` | One row per 15-minute slot: calendar flags and weather |
| `clima_horario_raw.parquet` | Cached hourly weather |
| `metadata.json` | Period, counts, targets and weather variables |

## Current dataset

| Item | Value |
| --- | --- |
| Period | 2025-10-01 to 2026-09-30, 35,040 slots |
| Trips in the raw files | 45,384,105 |
| Trips after cleaning | 45,226,146 (99.7%) |
| Electric share of trips | 72% |
| Stations with at least 100 trips | 2,515 of 2,627 found, 2,059 active the whole period |
| Rows in `demanda_15min.parquet` | 81,158,880, of which 74.9% have no departures |
| Federal holidays | 12 |
| Temperature range | -18.3 to 40.7 C, monthly mean from -3.1 C (Feb) to 25.3 C (Jul) |

## Checks

The rewritten notebook was run on Jul to Sep 2026 only and compared with the tables built by the first version.
Every one of the 20,865,600 rows and all six target columns are identical, as are the weather columns and the station totals.
Station coordinates differ by less than 0.0000041 degrees, about 0.4 m.

## Things to know

- `station_idx` is sorted by activity, so it changes when months are added.
  The shipped v2 network was trained on the Jul to Sep order.
  Map between tables with `station_id`, never with `station_idx`.
- 54 stations are new compared with the v2 training window, and the 12-month table keeps all 2,461 v2 stations.
- `MODELO_pytorch.ipynb` is the v2 recipe and has not been changed.
  It reads `data_procesada/` and writes `notebooks/modelos/demanda_net_v2.*`.
  Running it now would train on 12 months with the new station order and overwrite the v2 files.
  `MODELO_v3.ipynb` writes only `demanda_net_v3.*`, see [model.md](model.md).
- `scripts/extract_stations.py` reads every zip in `data/raw/`.
  Running it now would rebuild `ui/src/data/stations.json` from 12 months and change its trip counts, so run it when the new model ships and rerun `scripts/assign_regions.py` after it.
- The 12 monthly files are 8.5 GB extracted.
  Delete the extracted `notebooks/YYYYMM-citibike-tripdata/` folders after the run if disk space matters, the zips are enough.

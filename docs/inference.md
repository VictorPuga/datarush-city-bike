# Inference

The Next.js API runs `demanda_net_v2.onnx` with `onnxruntime-node`.
Code is in `ui/src/lib/model.ts`, `weather.ts`, `calendar.ts` and `insights.ts`.

## Files

| File | Purpose |
| --- | --- |
| `ui/models/demanda_net_v2.onnx` | The model (gitignored) |
| `ui/models/station_ids.json` | The 2,461 station ids in model order |
| `ui/models/estaciones.parquet` | Source of `station_ids.json` from the ML repo (`station_idx` order) |

`MODELS_DIR` overrides the folder.
`station_ids.json` is the `station_id` column sorted by `station_idx`, kept as strings (`5905.10` must not become `5905.1`).
Check it against the checkpoint order in the ML repo if the model is retrained.
The first ids are `6233.04`, `6140.05`, `6331.01`.

## Model contract

Inputs, one row per 15-minute slot:

| Input | Type | Meaning |
| --- | --- | --- |
| `slot_dia` | int64 `[S]` | Slot of the day, 0 to 95 |
| `dia_semana` | int64 `[S]` | Day of week, Monday = 0 |
| `es_festivo` | float32 `[S]` | 1 on a US federal holiday |
| `clima` | float32 `[S, 6]` | `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `precipitation`, `precip_prev2h`, `weather_code` |

Output `lambda` is float32 `[S, 2461, 4]`: expected bikes per 15 minutes for `salidas_classic`, `salidas_electric`, `llegadas_classic`, `llegadas_electric` (departures then arrivals).
One call with `S = 96` predicts a whole day, so the result is cached per date (8 dates).

## Weather

`weather.ts` fetches hourly values from Open-Meteo for NYC in the Open-Meteo default units (°C, km/h, mm).
It uses the forecast API from 90 days back to 15 days ahead and the archive API before that.
`precip_prev2h` is the precipitation of the two hours before the slot's hour.
Each hour's values apply to its four slots.
If Open-Meteo fails or the date is further ahead, a mild default is used and the API returns `weather: "default"`.
The failure is cached for 5 minutes.
The units and the `precip_prev2h` definition are assumed to match training, so confirm them with the ML team.

## Holidays

`calendar.ts` flags the US federal holidays and their observed weekdays.
Confirm which days training treated as `es_festivo`.

## From rates to bikes available

The model predicts flows, not stock.
For each station and bike type:

1. Net change per slot is arrivals minus departures.
2. Stock at the start of a slot is the baseline plus the net change accumulated since 00:00.
3. The baseline is the bikes needed so stock never drops below 0 that day, plus 5% of the day's departures (`POPULARITY_SHARE`), so busier stations start fuller.

The confidence range is ±1.28σ (80%) with σ = √(sum of arrivals and departures so far), which is Poisson noise and grows through the day.
Departures use the slot's rate with ±1.28√λ.
The baseline is an assumption, not a measured stock.

## Station coverage

2,366 of the 2,393 stations in `stations.json` are in the model.
The other 27 and the 95 model stations without a region are left out.

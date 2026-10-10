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

The v3 model in `notebooks/modelos/` has the same inputs, a second output `alpha` and 2,515 stations, see [model.md](model.md).
The dashboard serves v2 until the UI changes listed there are made.

## Weather

`weather.ts` fetches hourly values from Open-Meteo for NYC in the Open-Meteo default units (°C, km/h, mm).
It uses the forecast API from 90 days back to 15 days ahead and the archive API before that.
`precip_prev2h` is the precipitation of the two hours before the slot's hour.
Each hour's values apply to its four slots.
If Open-Meteo fails or the date is further ahead, a mild default is used and the API returns `weather: "default"`.
The failure is cached for 5 minutes.
Known gap: training takes the rain of hour h from the Open-Meteo value stamped h+1 and interpolates temperature, humidity and wind to 15 minutes, while this code uses the value stamped h for the four slots of the hour.
Rain and `precip_prev2h` are therefore one hour late here, which raises the test NLL from 0.32702 to 0.32834 on a mostly dry block (emulated in Python).
It is fixed together with the next model, see [evaluation.md](evaluation.md).

## Holidays

`calendar.ts` flags the US federal holidays and their observed weekdays.
Training uses the same definition: `LIMPIEZA_citibike.ipynb` flags US federal holidays only, without the New York state dates that the `holidays` library adds for `state='NY'`.
v2 was trained on Jul to Sep 2026, where both definitions give the same three dates.

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

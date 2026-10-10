# Inference

The Next.js API runs `demanda_net_v3.onnx` with `onnxruntime-node`.
Code is in `ui/src/lib/`: `model.ts` (inference and series), `intervals.ts` (negative binomial quantiles and variance formulas), `weather.ts`, `calendar.ts` and `insights.ts`.

## Files

| File | Purpose |
| --- | --- |
| `ui/models/demanda_net_v3.onnx` | The model (gitignored) |
| `ui/models/estaciones_onnx_v3.json` | The 2,515 stations in model order with `active`, the shock variances and `alpha_floor` |

Both files come from `notebooks/modelos/`.
`MODELS_DIR` overrides the folder.
Station ids stay strings (`5905.10` must not become `5905.1`).
`demanda_net_v2.onnx`, `station_ids.json` and `estaciones.parquet` are the v2 files and are no longer read.

## Model contract

Inputs, one row per 15-minute slot:

| Input | Type | Meaning |
| --- | --- | --- |
| `slot_dia` | int64 `[S]` | Slot of the day, 0 to 95 |
| `dia_semana` | int64 `[S]` | Day of week, Monday = 0 |
| `es_festivo` | float32 `[S]` | 1 on a US federal holiday |
| `clima` | float32 `[S, 6]` | `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `precipitation`, `precip_prev2h`, `weather_code` |

Outputs, both float32 `[S, 2515, 4]` with channels departures classic, departures electric, arrivals classic, arrivals electric:

| Output | Meaning |
| --- | --- |
| `lambda` | Expected bikes per 15 minutes |
| `alpha` | Negative binomial dispersion of one cell: variance = lambda + alpha lambda^2 |

One call with `S = 96` predicts a whole day, so the result is cached per date (8 dates).
The cache holds the expected stock and its standard deviation per station and per neighbourhood, so a request only reads one slot.

## Weather

`weather.ts` fetches hourly values for NYC in the Open-Meteo default units (°C, km/h, mm).
It uses the forecast API from 90 days back to 15 days ahead and the archive API before that.
`climaFromHourly` builds the `clima` input as training does (`clima_day` in `notebooks/ui_reference.py` is the spec):

- The request spans `date - 1` to `date + 1`, 72 hourly values.
- Temperature, humidity and wind are interpolated linearly to the 15-minute slot.
- The rain of hour h is the value stamped h + 1, held for the 4 slots of the hour.
  The weather code of hour h is the one stamped h.
- `precip_prev2h` is the sum of the rain of the 8 previous slots divided by 4.

Fallbacks:

- On the last forecast day, `date + 1` is out of Open-Meteo's range and the request is refused.
  The request is repeated up to `date`, and the one missing value (00:00 of the day after) repeats 23:00.
- A null or missing value takes the previous valid value, or the next one at the start of the series.
  A variable with no valid value takes the mild default (18 °C, 60%, 10 km/h, no rain, code 0).
- A request that fails (timeout, 429 or 5xx) is retried once after 500 ms.
  If it fails again, or the date is more than 15 days ahead, the default weather is used for all slots, the API returns `weather: "default"` and the dashboard says so.
  The failure is cached for 5 minutes and logged as a warning on the server.

`hoursFromClima` reads the `clima` slots at the start of each hour to give the 24 hourly values of `/api/weather`.
The endpoint shares the per-date weather cache with the forecast.

## Holidays

`calendar.ts` flags the US federal holidays and their observed weekdays.
Training uses the same definition: `LIMPIEZA_citibike.ipynb` flags US federal holidays only, without the New York state dates that the `holidays` library adds for `state='NY'`.

## From rates to bikes available

The model predicts flows, not stock.
For each station and bike type:

1. Net change per slot is arrivals minus departures.
2. Stock at the start of a slot is the baseline plus the net change accumulated since 00:00.
3. The baseline is the bikes needed so stock never drops below 0 that day, plus 5% of the day's departures (`POPULARITY_SHARE`), so busier stations start fuller.

The baseline is an assumption, not a measured stock.

## Ranges

All ranges are 80% ranges calibrated on held-out weeks, see [model.md](model.md).

- **Departures and arrivals of a station in 15 minutes:** the mean with one decimal and the 10% and 90% quantiles of the negative binomial with mean `lambda` and dispersion `alpha`, found by the recursion in `nbQuantile`.
  The bounds are whole bikes.
- **Stock of a station:** the stock value plus or minus `Z_80 = 1.28` standard deviations, rounded down and up and never below 0.
  The standard deviation is the one of the cumulative net flow since midnight, `sqrt(noise + (D + R + Ds) M^2 + (H + Hs) sum_h M_h^2)` with the shocks `D`, `H`, `R`, `Ds`, `Hs` per bike type from `estaciones_onnx_v3.json` and `alpha_idio = max(alpha - (D + H + R + Ds + Hs), alpha_floor)`.
  The band covers the net flow, not the baseline, which is an assumption.
- **Neighbourhoods:** `regionPredictions` computes the mean and the standard deviation of the sum over the active stations of the neighbourhood (`groupSlot`, `groupStock`) and takes the bounds from them.
  Departures and arrivals use the negative binomial with that mean and variance (`groupFlowBand`).
  `/api/predictions` returns them in `regions`, so the client no longer adds station bounds, which were 3.9 times too wide.

`yarn check:reference` in `ui/` runs these functions on `data/results/ui_reference_v3.json` and prints the largest difference per quantity.
Tolerances: `clima` 1e-4, `lambda` and `alpha` 1e-4 relative, stock mean and standard deviation 1e-3, integer bounds identical.
The script loads the TypeScript with Node's type stripping and `scripts/ts-loader.mjs`, which resolves the `@/` alias and extensionless imports.

## Station coverage

`stations.json` has 2,490 stations.
2,462 are in the model, and 74 of those are marked `active: false` (no trips in the last 28 days).
The dashboard shows the 2,388 active stations, all of which have a neighbourhood.
Inactive stations and the 28 that the model does not have are left out of the map, search, rankings, neighbourhood sums and insights.


# Demand model v3

`notebooks/MODELO_v3.ipynb` trains and scores the v3 demand model with the protocol of [evaluation.md](evaluation.md), and exports it for the dashboard.
It replaces the v2 network of `MODELO_pytorch.ipynb`, which is unchanged.
The dashboard still serves v2 until the UI changes listed below are made.

## Files

| File | Content |
| --- | --- |
| `notebooks/citibike_model.py` | The network, its training loop and the ONNX wrapper |
| `notebooks/citibike_intervals.py` | The shared shocks and the calibrated intervals |
| `notebooks/citibike_v2recipe.py` | The v2 network recipe retrained on the same data, as a reference |
| `notebooks/MODELO_v3.ipynb` | Experiments, final fit, test scoring and export |
| `notebooks/modelos/demanda_net_v3.onnx` | The model for the dashboard (1.2 MB) |
| `notebooks/modelos/demanda_net_v3.pt` | PyTorch checkpoint |
| `notebooks/modelos/estaciones_onnx_v3.json` | Stations in model order with an `active` flag, and the shock variances |
| `notebooks/modelos/station_ids_v3.json` | Station ids in model order, the file the UI reads as `station_ids.json` |

## Design

For station s, 15-minute slot t and target c (departures and arrivals, classic and electric bikes):

```
log mu[s,t,c] = b[s,c] + g0[t,c] + sum_r U[s,r,c] * G[t,r,c]
```

- A network over the calendar and weather of the slot produces `g0` and `G` once per slot.
- Each station supplies `b` and `U` (24 factors per target) from a free embedding, a neighbourhood embedding and its coordinates.
  The neighbourhood part is what gives a forecast to stations that have no training data.
- A cell costs a dot product, so a training step handles 96 slots times all 2,515 stations.
  A 16-epoch fit takes about 6 minutes on 8 CPU cores.
  The v2 recipe takes about 20 minutes for the same number of steps.
- The likelihood is negative binomial: `variance = mu + alpha * mu^2` with `log alpha = a[c] + k[c] * log mu + d[s,c]`, so the dispersion depends on the rate, the target and the station.
- The 13 inputs are the ones the ONNX contract provides: slot of the day, weekday, weekend, federal holiday, temperature, humidity, wind, rain, rain of the previous 2 hours and the weather code group.
  Snowfall is not an input, because the `clima` input has no snow column.
Dropping it moved the validation deviance from 0.8692 to 0.8699.
- Training adds Gaussian noise (0.15 standard deviations) to the weather, keeps an exponential moving average of the weights and uses a cosine schedule.
- The day of the year is not an input.
  With one year of data it cannot be told apart from the trend, and the folds cannot validate it.

## Calibrated intervals

A cell's `alpha` is the total over-dispersion of one cell.
Part of it is noise that is independent between cells and part is shared by many cells: the weather of a day or an hour, a neighbourhood event, a station that is out of service.
Summing independent cell intervals ignores the shared part and is far too narrow for totals.

Per bike type, five shared shocks multiply the rate, with variances fitted on the five held-out folds by non-negative least squares over six aggregation families (station, neighbourhood and city, by hour and by day):

| bike | D | H | R | Ds | Hs |
| --- | --- | --- | --- | --- | --- |
| classic | 0.0031 | 0.0248 | 0.0132 | 0.0496 | 0.0937 |
| electric | 0.0046 | 0.0197 | 0.0070 | 0.0385 | 0.0413 |

`D` is a city-wide shock for the day, `H` one per hour of the day, `R` one per neighbourhood and day, `Ds` one per station and day and `Hs` one per station and hour.
The independent part of a cell's dispersion is `alpha_idio = max(alpha - (D + H + R + Ds + Hs), 0.01)`.
For any set of cells in one day with mean `M`:

```
V = sum(mu + alpha_idio * mu^2) + D*M^2 + H*sum_h(M_h^2) + R*sum_r(M_r^2) + Ds*sum_s(M_s^2) + Hs*sum_sh(M_sh^2)
```

The interval is the negative binomial with mean `M` and variance `V`.
For one station the neighbourhood and city shocks look the same as the station ones, so the dashboard needs two numbers per bike type: `day = D + R + Ds` and `hour = H + Hs`.
The cumulative net flow (arrivals minus departures since midnight, the quantity behind the stock band) uses the net mean in the shock terms, because both flows share the shocks.

## ONNX contract

Inputs are unchanged from v2: `slot_dia` int64 `[S]`, `dia_semana` int64 `[S]`, `es_festivo` float32 `[S]`, `clima` float32 `[S, 6]` (temperature, humidity, wind, precipitation, `precip_prev2h`, weather code).
Outputs:

| Output | Shape | Meaning |
| --- | --- | --- |
| `lambda` | float32 `[S, 2515, 4]` | Expected bikes per 15 minutes, same target order as v2 |
| `alpha` | float32 `[S, 2515, 4]` | Negative binomial dispersion of one cell |

`lambda` is the first output and has the v2 shape except for the number of stations, which the UI reads from `station_ids.json`.
The output matches PyTorch to 8e-6 for `lambda` and 3e-5 for `alpha`, and a whole-day call gives the same numbers as single-slot calls.
2,423 of the 2,515 stations had trips in the last 28 days, and the JSON file marks the others as inactive.

## Results

Test block, Sep 17 to 30.
All rows are the mean of total departures and total arrivals, and `v3, refit` is the model that ships.

| model | deviance_15min | mae_15min | wape_hour | wape_day | bias |
| --- | --- | --- | --- | --- | --- |
| v3, refit (ships) | 0.7910 | 0.5060 | 0.4678 | 0.2086 | 0.9238 |
| v3, train-only | 0.7970 | 0.5073 | 0.4724 | 0.2161 | 0.9149 |
| v2 recipe retrained on 12 months | 0.8036 | 0.5098 | 0.4784 | 0.2313 | 0.9086 |
| v2 network (shipped, Jul to Sep) | 0.8302 | 0.5163 | 0.4974 | 0.2555 | 0.8871 |
| C|all+level (baseline to beat) | 0.9111 | 0.5658 | 0.5674 | 0.3339 | 1.0693 |
| C|all | 0.9447 | 0.5409 | 0.5758 | 0.4077 | 0.7824 |

- v3 (refit) is 4.7% lower than the shipped v2 in 15-minute deviance, 5.9% in station-hour WAPE and 18.3% in station-day WAPE.
- Against the baseline to beat the differences are 13.2%, 17.5% and 37.5%.
- Most of the gain over the shipped v2 comes from the data.
  The v2 recipe retrained on the 12 months is 3.2% lower in deviance and 9.4% lower in station-day WAPE.
  The new architecture adds 0.8% and 6.6% on top of that, with a third of the training time, a forecast for new stations and a calibrated distribution.
- The refit gains 3.5% in station-day WAPE over the train-only fit by seeing the two weeks before the test block.
- v3 still under-predicts the cold test block by 8%.

Log score on the test block, lower is better: v3 negative binomial 0.4846, v3 means with a Poisson distribution 0.4925, v2 means with a Poisson distribution 0.5026.

### Variants, validation block

Every variant was fitted on days before Sep 3.

| model | deviance_15min | wape_hour | wape_day | bias | logscore_poisson | logscore_nb |
| --- | --- | --- | --- | --- | --- | --- |
| nb_prior | 0.8699 | 0.4496 | 0.1908 | 0.9468 | 0.5567 | 0.5462 |
| poisson | 0.8693 | 0.4498 | 0.1910 | 0.9486 | 0.5565 |  |
| nb_noprior | 0.8745 | 0.4529 | 0.1945 | 0.9493 | 0.5578 | 0.5472 |
| nb_rank48 | 0.8694 | 0.4488 | 0.1913 | 0.9432 | 0.5565 | 0.5461 |

- Poisson and negative binomial give the same point forecast, and the negative binomial improves the log score by about 0.01.
- Dropping the neighbourhood prior raises the deviance by 0.5% and the station-day WAPE by 1.9%.
- Rank 48 gives no gain over rank 24.

### Rolling origin, mean of the five weekly folds

| model | deviance_15min | mae_15min | wape_hour | wape_day | bias |
| --- | --- | --- | --- | --- | --- |
| v3 | 0.8653 | 0.5666 | 0.4701 | 0.1904 | 0.9942 |
| C|all+level | 0.9363 | 0.5763 | 0.4948 | 0.2338 | 0.9913 |

### Where v3 gains most, test block, total departures

By station volume tier (departures per day in the training window), v3 train-only against the shipped v2:

| Tier | Stations never seen | below 2 | 2 to 5 | 5 to 15 | 15 to 40 | above 40 |
| --- | --- | --- | --- | --- | --- | --- |
| v2 deviance | 1.528 | 0.174 | 0.283 | 0.491 | 0.804 | 1.285 |
| v3 deviance | 0.452 | 0.072 | 0.281 | 0.485 | 0.794 | 1.230 |
| v2 bias | 2.51 | 6.13 | 0.91 | 0.89 | 0.89 | 0.88 |
| v3 bias | 0.78 | 0.77 | 0.85 | 0.88 | 0.91 | 0.92 |

The full breakdowns by tier, borough, neighbourhood, hour, weekday and day type are in `data/results/breakdown_test_v3.csv`.
Weekends are no longer over-forecast: the bias is 1.03 for v3, 0.94 for v2 and 1.54 for the baseline to beat.

### Interval coverage, test block

Nominal 80% and 90%, total departures and arrivals of both bike types, intervals from the shocks fitted on the folds.

| group | window | 80% interval | 90% interval |
| --- | --- | --- | --- |
| station | day | 0.842 | 0.911 |
| station | hour | 0.938 | 0.969 |
| neighbourhood | day | 0.673 | 0.798 |
| neighbourhood | hour | 0.853 | 0.920 |
| borough | day | 0.546 | 0.729 |
| borough | hour | 0.760 | 0.850 |
| city | day | 0.446 | 0.750 |
| city | hour | 0.656 | 0.767 |

- For station-days the Poisson assumption of the dashboard covered 0.53 and 0.62.
  The calibrated intervals cover 0.84 and 0.91.
- Station-hour and neighbourhood-hour coverage is at or above nominal.
  At 15 minutes most counts are 0, so a discrete interval cannot reach 80% and the cell coverage is 0.96.
- City, borough and neighbourhood totals per day are too narrow on this block.
  The block holds the two wettest days of the year (24.5 and 49.8 mm), where v3 over-predicts by 33% and 53%, and cold dry days, where the actual is 6% to 19% above the forecast.
  The standard deviation of the city-day log ratio is 0.17 here and 0.11 on the folds.
Only 14 city-days are scored, so the city-day number is noisy.
  On the validation block the same intervals cover 0.75, 0.79 and 0.77 of city, borough and neighbourhood days at the 80% level.
- Cumulative net flow, the quantity behind the stock band, is covered at 0.88 to 0.93 for the 80% interval and 0.93 to 0.96 for the 90% interval at every hour checked.
  That is above nominal because the Gaussian interval with a continuity correction is wide when the variance is small.

| quantity | 80% interval | 90% interval |
| --- | --- | --- |
| cumulative net to 06:00 | 0.914 | 0.949 |
| cumulative net to 09:00 | 0.881 | 0.932 |
| cumulative net to 12:00 | 0.890 | 0.941 |
| cumulative net to 15:00 | 0.905 | 0.950 |
| cumulative net to 18:00 | 0.919 | 0.957 |
| cumulative net to 21:00 | 0.926 | 0.959 |
| station-day net | 0.929 | 0.961 |

## What did not help

- **A level correction.** The brief proposed scaling by the recent level.
  A model frozen at Aug 12 and run five weeks ahead has weekly actual over predicted ratios of 1.00, 0.96, 0.95, 0.98 and 1.14, with no persistence.
  Scaling by the previous week's ratio helped two weeks and hurt two, and made week 5 worse (station-day WAPE 0.199 to 0.211).
It is not used.
  The model does not degrade over the five frozen weeks either (deviance 0.862 to 0.882).
- **Rank 48 and the Poisson loss** gave no better point forecast.
- **Snowfall as an input** was dropped to keep the ONNX inputs, at a cost of 0.0007 in deviance.

## Limits

- One year of data cannot separate the year-on-year trend from the season.
  The cold dry days of the test block are still under-predicted, which could be growth since the autumn of 2025 or a weather response that is too cautious.
  Tell them apart with a second year.
- Heavy rain is over-predicted: the 49.8 mm day had 33,162 departures and the model predicted 50,739.
- Demand is only the satisfied demand.
  Trip data cannot show a station that was empty or full.
- Only the federal holidays in the data are modelled (12 days), and the test block has none.
- Stock is not observed, so the dashboard's stock band can only be checked against the cumulative net flow.

## UI changes needed to serve v3

The v2 contract is kept, so the UI keeps working if `ui/models/` receives `demanda_net_v3.onnx` and `station_ids_v3.json` renamed as the UI expects.
To use the new outputs:

1. `ui/src/lib/model.ts`: read the `alpha` output, replace the Poisson bands (`Z_80 * sqrt(value)`) with negative binomial quantiles, and compute the stock band from the cumulative net variance above.
2. `ui/src/lib/weather.ts`: use the rain stamped at hour h+1 for hour h, interpolate temperature, humidity and wind to 15 minutes, and compute `precip_prev2h` as training does (see [inference.md](inference.md)).
3. Hide stations marked `active: false`, and regenerate `stations.json` and `regions.json` from the 12 months so the 54 new stations have a region.
4. Region ranges in `lib/regions.ts` are plain sums of the station bounds.
   Use the variance formula for sums instead.
5. Update `docs/inference.md` and `docs/dashboard.md` in the same change.

## Run

```sh
cd notebooks
jupyter lab MODELO_v3.ipynb
```

Run `LIMPIEZA_citibike.ipynb` and `EVALUACION_protocolo.ipynb` first.
Models and predictions are cached in `tmp/v3/`, so a rerun takes about 2 minutes.
Delete that folder to retrain everything, which takes about 90 minutes on 8 CPU cores and about 4 GB of memory.

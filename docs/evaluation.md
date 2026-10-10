# Model evaluation

Every demand model is scored with one fixed protocol, so results from different models and different weeks can be compared.
The protocol is implemented in `notebooks/citibike_eval.py` and run by `notebooks/EVALUACION_protocolo.ipynb`.
It was fixed before any new model was trained, and it does not change between experiments.
The tables are written to `data/results/`.

## Data and blocks

The data is the 12-month station by 15-minute table described in [ml-data.md](ml-data.md): 2,515 stations, Oct 2025 to Sep 2026.
Blocks are whole days, and a model only sees days before the block it is scored on.

| Block | Dates | Use |
| --- | --- | --- |
| Rolling folds 1 to 5 | Aug 13 to Sep 16, one week each | Choose settings. The model is fitted on everything before the fold |
| Validation | Sep 3 to 16 | Choose the baseline to beat |
| Test | Sep 17 to 30 | Final score only. It never drives a decision |

Two fits are reported for the test block.
`train-only` ends on Sep 2, the same cut-off the shipped v2 network used.
`refit` ends on Sep 16, after the validation block, with settings that were chosen before looking at the test block.
The model that ships is the `refit` one.

## Baselines

Baselines are historical means of the observed counts, with a cold-start rule: a station with no training data in a group gets the median station profile of that group.
A baseline that forecasts 0 for such stations would be penalised unfairly.

| Name | Definition |
| --- | --- |
| `A` | Station mean |
| `B` | Station x weekday x slot of the day |
| `C` | Station x workday-or-free x slot of the day |
| `all`, `8w`, `jul-sep` | Training window: the whole history before the block, the last 8 weeks, or Jul 1 to Sep 2 (the window v2 was trained on) |
| `all+level` | `C|all` rescaled by the city-wide level of the last 4 weeks, per target |

The baseline to beat is chosen on the validation block by 15-minute Poisson deviance, never on the test block.

## Metrics

All metrics are computed per station and per target, at three aggregation levels: 15 minutes, station-hour and station-day.
Station-hour and station-day cells are only used when the station is active for the whole hour or day.

| Metric | Meaning |
| --- | --- |
| Poisson deviance | Primary at 15 minutes. Mean of 2(y log(y/p) - (y - p)) |
| WAPE | Primary at station-hour and station-day. Sum of absolute errors over the sum of actuals |
| Bias | Sum of predictions over the sum of actuals. 1 is unbiased |
| MAE, RMSE | Reported for completeness |
| sMAPE | Station-hour and station-day only, with 0/0 counted as 0. MAPE is not used because demand is near zero for many stations |
| Log score | Mean of -log P(y), a proper score that can compare Poisson and negative binomial forecasts |
| Interval coverage | Share of actuals inside the central 80% and 90% interval, with mean width and the Winkler interval score |

MAE is not a primary metric.
Most 15-minute counts are 0, so a forecast that is too low gets a lower MAE.
For example `C|all` under-predicts the test block by 22% and still has a lower MAE than the level-scaled baseline.

Targets are the four channels (departures and arrivals, classic and electric) plus total departures and total arrivals.
Breakdowns are reported for total departures and total arrivals by station volume tier, borough, neighborhood (NTA), hour, weekday and day type.
Volume tiers use the departures per day in the training window: below 2, 2 to 5, 5 to 15, 15 to 40 and above 40.
Stations with no training data form their own group.

## Run

```sh
cd notebooks
jupyter lab EVALUACION_protocolo.ipynb
```

Run `LIMPIEZA_citibike.ipynb` first.
The notebook takes about 3 minutes and about 3 GB of memory.
New models are scored by passing a function to the same helpers in `citibike_eval.py`, so they land in the same CSV files.

## Results so far

All numbers are the mean of total departures and total arrivals.
v2 is the shipped network, trained on Jul 1 to Sep 2 and early-stopped on the validation block, so its validation numbers are not fully held out and are not reported.

### Baseline to beat, chosen on the validation block

| model | deviance_15min | mae_15min | wape_hour | wape_day | bias |
| --- | --- | --- | --- | --- | --- |
| C|all+level | 0.9344 | 0.5784 | 0.4640 | 0.2135 | 0.9124 |
| C|all | 1.0391 | 0.5822 | 0.5266 | 0.3715 | 0.6675 |
| C|jul-sep | 1.0599 | 0.5849 | 0.4711 | 0.2202 | 0.9036 |
| C|8w | 1.0883 | 0.5886 | 0.4725 | 0.2193 | 0.9293 |
| B|all | 1.1899 | 0.5834 | 0.5277 | 0.3699 | 0.6719 |
| A|all | 1.4852 | 0.7523 | 0.7849 | 0.3830 | 0.6718 |
| B|jul-sep | 1.6654 | 0.5962 | 0.4827 | 0.2230 | 0.9036 |
| B|8w | 1.7666 | 0.6009 | 0.4846 | 0.2190 | 0.9282 |

`C|all+level` is the strongest baseline on validation, so it is the bar.

### Test block, Sep 17 to 30

| model | fit | deviance_15min | mae_15min | wape_hour | wape_day | bias |
| --- | --- | --- | --- | --- | --- | --- |
| v2 network (shipped) | train-only | 0.8302 | 0.5163 | 0.4974 | 0.2555 | 0.8871 |
| C|all+level | train-only | 0.9111 | 0.5658 | 0.5674 | 0.3339 | 1.0693 |
| C|all | train-only | 0.9447 | 0.5409 | 0.5758 | 0.4077 | 0.7824 |
| C|8w | train-only | 1.0648 | 0.5864 | 0.6003 | 0.3634 | 1.0772 |
| C|jul-sep | train-only | 1.0362 | 0.5788 | 0.5908 | 0.3572 | 1.0504 |
| B|all | train-only | 1.0541 | 0.5388 | 0.5712 | 0.4034 | 0.7789 |
| A|all | train-only | 1.3712 | 0.7005 | 0.8539 | 0.4394 | 0.7789 |
| C|all+level | refit (train + val) | 0.8993 | 0.5677 | 0.5675 | 0.3310 | 1.0968 |
| C|all | refit (train + val) | 0.9246 | 0.5391 | 0.5694 | 0.3979 | 0.7981 |
| C|8w | refit (train + val) | 1.0204 | 0.5812 | 0.5881 | 0.3500 | 1.0990 |
| B|all | refit (train + val) | 1.0174 | 0.5362 | 0.5634 | 0.3918 | 0.7943 |
| A|all | refit (train + val) | 1.3596 | 0.7019 | 0.8538 | 0.4306 | 0.7944 |

The shipped v2 network against the bar on the test block: 8.9% lower deviance, 8.8% lower MAE, 12.3% lower station-hour WAPE and 23.5% lower station-day WAPE.
Against plain `C|all` the deviance gain is 12.1% and the station-day WAPE gain is 37.3%.
Every model is biased on this block, which is colder than most of the history: v2 under-predicts by 11% and the bar over-predicts by 7%.

### Rolling origin, mean of the five weekly folds

| model | deviance_15min | mae_15min | wape_hour | wape_day | bias |
| --- | --- | --- | --- | --- | --- |
| C|all+level | 0.9363 | 0.5763 | 0.4948 | 0.2338 | 0.9913 |
| C|all | 1.0142 | 0.5635 | 0.5301 | 0.3487 | 0.7089 |
| C|8w | 1.0700 | 0.5752 | 0.4871 | 0.2159 | 0.9765 |
| B|all | 1.1519 | 0.5627 | 0.5280 | 0.3489 | 0.7085 |
| B|8w | 1.7157 | 0.5853 | 0.4953 | 0.2149 | 0.9753 |
| A|all | 1.4146 | 0.7228 | 0.7877 | 0.3573 | 0.7086 |

Only baselines are available here, because v2 cannot be refitted on earlier folds without retraining.
No baseline wins on every metric: `C|all+level` has the lowest deviance, and `C|8w` and `B|8w` have the lowest station-day WAPE.

### Where the shipped network is weak

Test block, total departures, bar against v2.

| tier (departures/day) | n cells | bar deviance | bar wape | bar bias | v2 deviance | v2 wape | v2 bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| no training data | 21504 | 1.2730 | 1.8210 | 1.0830 | 1.5280 | 2.8770 | 2.5120 |
| <2 | 114432 | 0.1500 | 1.7320 | 0.8120 | 0.1740 | 7.0620 | 6.1320 |
| 2-5 | 329760 | 0.4000 | 1.8870 | 1.0580 | 0.2830 | 1.7610 | 0.9060 |
| 5-15 | 876768 | 0.5380 | 1.6850 | 1.0460 | 0.4910 | 1.5760 | 0.8890 |
| 15-40 | 701472 | 0.8370 | 1.2990 | 1.0630 | 0.8040 | 1.2050 | 0.8880 |
| >40 | 1162848 | 1.4200 | 0.7140 | 1.0740 | 1.2850 | 0.6390 | 0.8800 |

v2 is better than the bar for stations with 2 or more departures per day.
For stations below 2 departures per day it over-predicts by a factor of 6.1, and for stations it never saw by a factor of 2.5.

| borough | n cells | bar deviance | bar wape | bar bias | v2 deviance | v2 wape | v2 bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manhattan | 923040 | 1.3240 | 0.7050 | 1.0620 | 1.1950 | 0.6330 | 0.8690 |
| Brooklyn | 1126176 | 0.8780 | 0.9390 | 1.0960 | 0.7880 | 0.8660 | 0.9280 |
| Queens | 654720 | 0.6290 | 1.2720 | 1.0850 | 0.5860 | 1.1790 | 0.9070 |
| Bronx | 493632 | 0.5340 | 1.5400 | 1.0110 | 0.5180 | 1.4660 | 0.8680 |

| day type | n cells | bar deviance | bar wape | bar bias | v2 deviance | v2 wape | v2 bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| workday | 2290080 | 0.8630 | 0.7300 | 0.9700 | 0.8550 | 0.7230 | 0.8770 |
| weekend | 916704 | 0.9910 | 1.3440 | 1.5400 | 0.7370 | 0.9650 | 0.9440 |

The test block has no holiday, so holidays cannot be scored on it.
The bar over-predicts weekends by 54% because its level comes from the last four summer weeks.

### Probabilistic quality of the current assumption

The dashboard treats every slot as an independent Poisson count with the model's rate.
Coverage of the central 80% and 90% intervals under that assumption, total departures, test block:

| model | aggregation | coverage of 80% interval | coverage of 90% interval |
| --- | --- | --- | --- |
| C|all+level (bar) | station, 15 min | 0.935 | 0.963 |
| C|all+level (bar) | station-hour | 0.857 | 0.905 |
| C|all+level (bar) | station-day | 0.481 | 0.566 |
| v2 network | station, 15 min | 0.932 | 0.960 |
| v2 network | station-hour | 0.866 | 0.913 |
| v2 network | station-day | 0.530 | 0.621 |

At 15 minutes most counts are 0, so a discrete interval cannot hit the nominal level and coverage is above it.
At station-day scale the intervals are far too narrow: the nominal 80% interval covers 53% of the days.
Errors are shared across slots within a day (weather, events), so the independence assumption fails.
This is the baseline that the negative binomial and day-factor work has to improve.

Log score at 15 minutes with a Poisson forecast, lower is better:

| target | C|all+level (bar) | v2 network |
| --- | --- | --- |
| llegadas_classic | 0.3735 | 0.3481 |
| llegadas_electric | 0.6938 | 0.6599 |
| salidas_classic | 0.3678 | 0.3443 |
| salidas_electric | 0.6900 | 0.6580 |

## Files

| File | Content |
| --- | --- |
| `data/results/point_metrics.csv` | Every model, fit, block, aggregation level and target |
| `data/results/bar_selection_val.csv` | The baselines ranked on the validation block |
| `data/results/breakdown_test.csv` | Test block metrics by tier, borough, neighborhood, hour, weekday and day type |
| `data/results/intervals_poisson_test.csv` | Coverage, width and Winkler score under the Poisson assumption |
| `data/results/logscore_poisson_test.csv` | Poisson log score per target |
| `data/results/point_metrics_v3.csv`, `breakdown_test_v3.csv` | The same tables for the v3 model and the v2 recipe retrained on 12 months |
| `data/results/intervals_v3_test.csv`, `intervals_v3_net_test.csv` | Coverage of the calibrated intervals, see [model.md](model.md) |
| `data/results/v3_*.csv`, `v3_shocks.json` | Variants on the validation block, folds, frozen-model drift and the fitted shock variances |

The v3 model is scored with the same blocks and metrics, see [model.md](model.md) for its results.
It lowers the test deviance by 13.2% and the station-day WAPE by 37.5% against the baseline to beat.

## Known limits

- With 12 months, only one summer-to-autumn transition is available, so the folds are all late summer and September.
- Demand is only the satisfied demand: an empty or full station hides trips that did not happen, and trip data cannot show it.
- The shipped network was trained on 64 days (Jul 1 to Sep 2), so its station embeddings do not cover the 54 stations that appear only in the 12-month table.
- Holidays: 12 federal holidays are in the table.
  The validation block contains Labor Day (Sep 7) and the test block contains none, so holiday error is only visible in the validation block.

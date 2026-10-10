# Dashboard

The Next.js app in `ui/` shows predicted classic and electric bikes per NTA neighborhood on a react-leaflet map.
Predictions come from the ONNX demand model through the Next.js API. See [inference.md](inference.md).

## Map

- **Regions:** one polygon per NTA neighborhood, always shown. Color follows bikes per station. Gray polygons have no stations.
- **Stations:** small bike-icon markers appear from zoom 16, colored by the predicted count for the selected bike type. Below that zoom only regions show. From that zoom the region fill is removed and only the outlines stay, which are still clickable.
- Clicking a region selects it. Clicking a station opens the station panel.
- Searching for a station flies the map to zoom 16, so its marker is visible.
- The zoom threshold is `STATION_MIN_ZOOM` in `ui/src/components/Map.tsx`.

## Insights

The `Insights` panel in the sidebar has five tabs, drawn with [Nivo](https://nivo.rocks) (`@nivo/line`, `@nivo/heatmap`, `@nivo/bar`).
Theme and colors are in `lib/nivoTheme.ts`.

| Tab | Chart | Data |
| --- | --- | --- |
| Day | Citywide classic and electric bikes per 15 minutes. Click to set the time. | `/api/insights` |
| Week | Day of week × 15-minute heatmap. Click a cell to set the date and time. | `/api/insights` |
| Top/Bottom | The 5 neighborhoods with the most and fewest predicted bikes. Click to fly to one. | Current predictions |
| Net flow | Diverging bars: the 5 biggest gaining and losing neighborhoods in the selected 15 minutes. | `/api/insights` |
| Demand | Histogram of the active stations by total trips, log scale. Highlights the selected station. | `stations.json` and the stations of `/api/predictions` |

- Day, Week and Net flow use `lib/insights.ts` on the server. Forecasts are cached per date on the server.
- Net flow is expected arrivals minus departures during the selected 15-minute slot.
- `StationChart` is the per-station forecast, a Nivo line chart with the 80% range drawn as a custom layer. Click to set the time.
- Ranking and Net flow follow the bike type toggle.

## Weather

The `Weather` card in the sidebar shows the conditions of the selected hour: icon, temperature, label, wind, humidity and rain, plus the day's temperature range and total rain.
It reads `/api/weather`, which returns the hourly Open-Meteo values that feed the model, so the card shows what the forecast assumed.
The card is hidden when the weather is `default`, and the notice about typical conditions stays.
`lib/weatherCodes.ts` maps WMO weather codes to a label and an emoji.

## Time and metric

- The time slider moves in 15-minute slots (0 to 95). `lib/time.ts` formats them.
- The **Bikes available / Departures / Arrivals** toggle switches every view between predicted stock, departures and arrivals in the slot.
- Departures and arrivals use a 0 to 6 color scale per station (`MAX_FLOW`), and stock uses 0 to 40.
- Only the 2,388 active stations that the model forecasts are shown. The other 102 of the 2,490 in `stations.json` are left out everywhere, see [inference.md](inference.md).

## Regions in the UI

- `lib/regions.ts` converts `regions.json` to Leaflet positions.
- `/api/predictions` returns a `regions` array next to `stations`, with stock, `departures` and `arrivals` for each of the 262 neighborhoods (zeros and `stations: 0` when none is active).
  The server computes the ranges from the variance of the sum, so the client no longer adds station bounds. See [inference.md](inference.md#ranges).
  The Bikes available / Departures / Arrivals toggle picks the metric on the client with `viewMetric`, as for stations.
- The response only gained fields (`regions`), and the station fields keep their names. Bounds of departures and arrivals are now whole bikes.
- Ranges are described as 80% ranges calibrated on held-out weeks in the legend and the station chart, and the legend says the stock baseline is an assumption.
- `RegionList` ranks neighborhoods that have stations by predicted bikes and flies the map to the one clicked.
- `StationPanel` shows the selected station's neighborhood and its totals.
- The former `react-leaflet-cluster` marker clustering was removed.
- The 550 KB `regions.json` is bundled into the client.

See [regions.md](regions.md) for how the data is produced.

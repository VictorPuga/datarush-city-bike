# Dashboard

The Next.js app in `ui/` shows predicted classic and electric bikes per NTA neighborhood on a react-leaflet map.
Predictions come from a mock API until the ML model is ready.

## Map

- **Regions:** one polygon per NTA neighborhood, always shown. Color follows bikes per station. Gray polygons have no stations.
- **Stations:** small circle markers appear from zoom 16, colored by the predicted count for the selected bike type. Below that zoom only regions show. From that zoom the region fill is removed and only the outlines stay, which are still clickable.
- Clicking a region selects it. Clicking a station opens the station panel.
- Searching for a station flies the map to zoom 16, so its marker is visible.
- The zoom threshold is `STATION_MIN_ZOOM` in `ui/src/components/Map.tsx`.

## Insights

The `Insights` panel in the sidebar has five tabs, drawn with [Nivo](https://nivo.rocks) (`@nivo/line`, `@nivo/heatmap`, `@nivo/bar`).
Theme and colors are in `lib/nivoTheme.ts`.

| Tab | Chart | Data |
| --- | --- | --- |
| Day | Citywide classic and electric bikes per hour. Click to set the hour. | `/api/insights` |
| Week | Day of week × hour heatmap. Click a cell to set the date and hour. | `/api/insights` |
| Top/Bottom | The 5 neighborhoods with the most and fewest predicted bikes. Click to fly to one. | Current predictions |
| Net flow | Diverging bars: the 5 biggest gaining and losing neighborhoods in the next hour. | `/api/insights` |
| Demand | Histogram of stations by total trips, log scale. Highlights the selected station. | `stations.json` |

- Day, Week and Net flow use `lib/insights.ts` on the server. Daily totals are cached per date.
- Net flow is the stock change from the selected hour to the next, because the API has no arrivals or departures.
- The per-station forecast line chart is still `StationChart`.
- Ranking and Net flow follow the bike type toggle.

## Regions in the UI

- `lib/regions.ts` converts `regions.json` to Leaflet positions and sums the `/api/predictions` response per region on the client. The API is unchanged.
- Low and high bounds are plain sums, so region ranges are wider than the true uncertainty.
- `RegionList` ranks neighborhoods that have stations by predicted bikes and flies the map to the one clicked.
- `StationPanel` shows the selected station's neighborhood and its totals.
- The former `react-leaflet-cluster` marker clustering was removed.
- The 550 KB `regions.json` is bundled into the client.

See [regions.md](regions.md) for how the data is produced.

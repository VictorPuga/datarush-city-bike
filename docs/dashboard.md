# Dashboard

The Next.js app in `ui/` shows predicted classic and electric bikes per station on a react-leaflet map.
Predictions come from a mock API until the ML model is ready.

## Views

- **Stations:** one density circle per station, with optional bike markers. Circle size and color grow with the predicted count.
- **Regions:** one polygon per NTA neighborhood. Color follows bikes per station. Gray polygons have no stations.

## Regions in the UI

- `lib/regions.ts` converts `regions.json` to Leaflet positions and sums the `/api/predictions` response per region on the client. The API is unchanged.
- Low and high bounds are plain sums, so region ranges are wider than the true uncertainty.
- `RegionList` ranks neighborhoods that have stations by predicted bikes and flies the map to the one clicked.
- `StationPanel` shows the selected station's neighborhood and its totals.
- The former `react-leaflet-cluster` marker clustering was removed.
- The 550 KB `regions.json` is bundled into the client.

See [regions.md](regions.md) for how the data is produced.

# Dashboard

The Next.js app in `ui/` shows predicted classic and electric bikes per NTA neighborhood on a react-leaflet map.
Predictions come from a mock API until the ML model is ready.

## Map

- **Regions:** one polygon per NTA neighborhood, always shown. Color follows bikes per station. Gray polygons have no stations.
- **Stations:** small circle markers appear from zoom 16, colored by the predicted count for the selected bike type. Below that zoom only regions show. From that zoom the region fill is removed and only the outlines stay, which are still clickable.
- Clicking a region selects it. Clicking a station opens the station panel.
- Searching for a station flies the map to zoom 16, so its marker is visible.
- The zoom threshold is `STATION_MIN_ZOOM` in `ui/src/components/Map.tsx`.

## Regions in the UI

- `lib/regions.ts` converts `regions.json` to Leaflet positions and sums the `/api/predictions` response per region on the client. The API is unchanged.
- Low and high bounds are plain sums, so region ranges are wider than the true uncertainty.
- `RegionList` ranks neighborhoods that have stations by predicted bikes and flies the map to the one clicked.
- `StationPanel` shows the selected station's neighborhood and its totals.
- The former `react-leaflet-cluster` marker clustering was removed.
- The 550 KB `regions.json` is bundled into the client.

See [regions.md](regions.md) for how the data is produced.

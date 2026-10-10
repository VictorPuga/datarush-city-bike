# DataRush City Bike

Predicts how many classic and electric Citi Bikes will be around NYC stations at a given date and hour.
A Next.js dashboard shows the predictions on a react-leaflet map, with a date picker and an hour slider.
Neighborhood polygons show bike density, with station markers when zoomed in.
A classic/electric toggle, station search, and a per-station 24-hour forecast with confidence range are included.
An ML model will serve the predictions through an API.
Until it is ready, a mock backend returns deterministic counts for a fixed list of stations.

## Repository layout

| Path | Purpose |
| --- | --- |
| `ui/` | Next.js dashboard and mock API |
| `scripts/` | Data preparation scripts |
| `data/raw/` | Raw Citi Bike trip files (gitignored) |
| `docs/` | Notes on each data process, see [docs/README.md](docs/README.md) |

## Data sources

- [Citi Bike](https://citibikenyc.com)
- [System data](https://citibikenyc.com/system-data)
- [Trip data archive](https://s3.amazonaws.com/tripdata/index.html)

Download the trip files into `data/raw/`.

### NYC regions

- [2020 Neighborhood Tabulation Areas (NTAs)](https://data.cityofnewyork.us/d/9nt8-h7nd), NYC Open Data id `9nt8-h7nd`
- 262 neighborhood polygons, used to divide the city into regions and group stations by the polygon that contains them.

See [docs/nta-dataset.md](docs/nta-dataset.md) for the download command and fields.

## Quick start

1. Download trip data into `data/raw/`.
2. Run `python3 scripts/extract_stations.py`.
3. Run `cd ui && yarn install && yarn dev`.
4. Open http://localhost:3000.

## Dashboard

### Stations
Run `python3 scripts/extract_stations.py` to derive all start stations from `data/raw/*.csv` (or `*.zip`).
Pass `--top N` to keep only the N busiest.
It writes `ui/src/data/stations.json`.

### Regions
Run `python3 scripts/assign_regions.py` to assign each station to its NTA polygon (standard library only).
It reads `stations.json` and `tmp/nta.geojson`, and writes `ui/src/data/regions.json` with a station-to-region map and the simplified polygons.
Every NTA is kept, including the ones with no stations.
The dashboard always shows regions, colored by predicted bikes per station, and adds small bike-icon station markers from zoom 16.
See [docs/regions.md](docs/regions.md).

### Run the UI
```sh
cd ui
yarn install
yarn dev
```

### Mock API
`GET /api/predictions?date=YYYY-MM-DD&hour=0-23` returns:
```json
{
  "date": "2026-10-09",
  "hour": 8,
  "stations": [{
    "id": "...", "name": "...", "lat": 40.7, "lon": -73.9,
    "classic": 12, "classicLow": 9, "classicHigh": 15,
    "electric": 5, "electricLow": 4, "electricHigh": 6
  }]
}
```
`GET /api/predictions/day?date=YYYY-MM-DD&station=ID` returns `{ date, station, hours: [{ hour, ...counts }] }` with 24 entries, used by the station chart.
Counts are deterministic per station, date and hour.
`GET /api/insights?date=YYYY-MM-DD&hour=0-23` returns `{ date, hour, week, netFlow }`.
`week` has the Monday to Sunday days around `date`, each with 24 citywide `{ classic, electric }` totals.
`netFlow` has one `{ id, classic, electric }` per neighborhood: the change in bikes from `hour` to the next hour.

Replace the route handler in `ui/src/app/api/predictions/route.ts` with a call to the inference API when it is ready.

# DataRush City Bike

Predicts how many classic and electric Citi Bikes will be around NYC stations at a given date and hour.
A Next.js dashboard shows the predictions on a react-leaflet map, with a date picker and an hour slider.
Circles show bike density, and a classic/electric toggle, station search, and a per-station 24-hour forecast with confidence range are included.
An ML model will serve the predictions through an API.
Until it is ready, a mock backend returns deterministic counts for a fixed list of stations.

## Repository layout

| Path | Purpose |
| --- | --- |
| `ui/` | Next.js dashboard and mock API |
| `scripts/` | Data preparation scripts |
| `data/raw/` | Raw Citi Bike trip files (gitignored) |

## Data sources

- [Citi Bike](https://citibikenyc.com)
- [System data](https://citibikenyc.com/system-data)
- [Trip data archive](https://s3.amazonaws.com/tripdata/index.html)

Download the trip files into `data/raw/`.

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
Replace the route handler in `ui/src/app/api/predictions/route.ts` with a call to the inference API when it is ready.

# DataRush City Bike

Predicts how many classic and electric Citi Bikes will be around NYC stations at a given date and 15-minute slot.
A Next.js dashboard shows the predictions on a react-leaflet map, with a date picker and a 15-minute time slider.
Neighborhood polygons show bike density, with station markers when zoomed in.
A classic/electric toggle, a bikes/departures/arrivals toggle, station search, and a per-station day forecast with confidence range are included.
The ML model (`demanda_net_v2.onnx`) runs inside the Next.js API with `onnxruntime-node`.
See [docs/inference.md](docs/inference.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `ui/` | Next.js dashboard and mock API |
| `slides/` | Slidev pitch deck, in Spanish |
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

### API
`GET /api/predictions?date=YYYY-MM-DD&slot=0-95` returns the forecast for one 15-minute slot (`slot` 0 is 00:00, 95 is 23:45):
```json
{
  "date": "2026-10-09",
  "slot": 32,
  "weather": "open-meteo",
  "stations": [{
    "id": "...", "name": "...", "lat": 40.7, "lon": -73.9,
    "classic": 12, "classicLow": 9, "classicHigh": 15,
    "electric": 5, "electricLow": 4, "electricHigh": 6,
    "departures": { "classic": 1.7, "classicLow": 0, "classicHigh": 3.3, "electric": 4, "electricLow": 1.5, "electricHigh": 6.6 },
    "arrivals": { "classic": 1.2, "classicLow": 0, "classicHigh": 2.6, "electric": 3.5, "electricLow": 1.1, "electricHigh": 5.9 }
  }]
}
```
The top-level counts are bikes available (stock).
`departures` is the expected number of bikes taken in that 15-minute slot.
`arrivals` has the same shape and is the expected number of bikes returned.
`weather` is `default` when Open-Meteo could not be reached.
`GET /api/predictions/day?date=YYYY-MM-DD&station=ID` returns `{ date, weather, station, slots: [{ slot, ...counts, departures, arrivals }] }` with 96 entries, used by the station chart.
`GET /api/insights?date=YYYY-MM-DD&slot=0-95` returns `{ date, slot, week, netFlow }`.
`week` has the Monday to Sunday days around `date`, each with 96 citywide `{ classic, electric, depClassic, depElectric }` slots.
`netFlow` has one `{ id, classic, electric }` per neighborhood: arrivals minus departures during `slot`.
Requests return 503 if the model files in `ui/models/` are missing.

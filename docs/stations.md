# Stations

`scripts/extract_stations.py` derives one record per start station from the raw Citi Bike trip files.

## Run

```sh
python3 scripts/extract_stations.py
python3 scripts/extract_stations.py --top 500
```

It reads `data/raw/*.csv` and `data/raw/*.zip`.
`--top N` keeps only the N busiest stations.
It uses the standard library only.

## Output

`ui/src/data/stations.json` is an array with 2,490 stations.
It was built from the 12 months Oct 2025 to Sep 2026, so `trips` and `electricShare` cover that period.

| Field | Meaning |
| --- | --- |
| `id` | Station id from `start_station_id` |
| `name` | Station name |
| `lat`, `lon` | Mean of the trip start coordinates, 5 decimals |
| `trips` | Number of trips starting at the station |
| `electricShare` | Share of those trips on electric bikes, 3 decimals |

The coordinates span lat 40.61 to 40.91 and lon -74.04 to -73.83.
That range may include stations outside NYC, such as Jersey City and Hoboken.

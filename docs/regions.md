# Regions

Stations are grouped into NYC Neighborhood Tabulation Areas (NTAs) so the dashboard can show predictions per neighborhood.
See [nta-dataset.md](nta-dataset.md) for the source data.

## Run

```sh
python3 scripts/assign_regions.py
```

Download `tmp/nta.geojson` first, using the command in [nta-dataset.md](nta-dataset.md).
Pass `--nta PATH` for another file, and `--tolerance DEGREES` to change the polygon simplification (default 0.00005, about 5 m).
The script uses the standard library only and runs in about a second.

## What it does

1. Reads the 262 NTA polygons and `ui/src/data/stations.json`.
2. Assigns each station to the polygon that contains it, with ray casting and a bounding-box check first. Holes are respected.
3. Falls back to the nearest polygon for any station outside every NTA, so no station is dropped. Currently none need it.
4. Moves stations that land in a park or cemetery listed in `PARK_REGIONS` (Central Park, Prospect Park, Flushing Meadows-Corona Park and several cemeteries) to the nearest neighboring NTA, measured to the polygon edges. Those stations sit on the park's edge streets, so they belong to the adjoining neighborhood. Currently 55 move. Add ids to `PARK_REGIONS` in the script to treat other regions the same way.
5. Simplifies the polygons with Douglas-Peucker and rounds them to 5 decimals. Assignment uses the original geometry.
6. Keeps every NTA, including those with no stations and the park regions themselves. Currently 142 of 262 are empty.

## Output

`ui/src/data/regions.json` is about 550 KB:

| Key | Meaning |
| --- | --- |
| `assignments` | Map of station id to NTA code |
| `regions` | Per NTA: `id`, `name`, `borough`, `lat`/`lon`, `stations`, `trips`, `electricShare`, `polygons` |

`lat`/`lon` is the mean of the region's stations, or the bounding-box center for empty regions.
`polygons` is GeoJSON `MultiPolygon` coordinates in lon/lat.
A region holds 0 to 57 stations.

## History

Stations were first grouped with k-means on location only (k=150, 8 to 26 stations each).
The NTA mesh replaced it, and `cluster_stations.py` and `clusters.json` were removed.
Fixed neighborhoods carry meaning and names, where k-means clusters were anonymous.

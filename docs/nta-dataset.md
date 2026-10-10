# NTA dataset

Station regions come from the 2020 Neighborhood Tabulation Areas (NTAs) published by NYC Planning on NYC Open Data.

## Source

- Dataset: 2020 Neighborhood Tabulation Areas (NTAs), NYC Open Data
- Dataset id: `9nt8-h7nd`
- Page: https://data.cityofnewyork.us/d/9nt8-h7nd
- GeoJSON endpoint: `https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=1000`

## Download

```sh
mkdir -p tmp
curl -sL "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?\$limit=1000" -o tmp/nta.geojson
```

## Contents

The file has 262 features, all `MultiPolygon` geometries in lon/lat (WGS84).
The raw file is about 4.6 MB.
It needs simplifying before it ships to the browser.

| Property | Meaning |
| --- | --- |
| `nta2020` | NTA code, for example `BK0101` |
| `ntaname` | Neighborhood name, for example `Greenpoint` |
| `boroname`, `borocode` | Borough name and code |
| `cdta2020`, `cdtaname` | Parent community district equivalent |
| `ntatype` | NTA type code: 0 (197 features), 5 (1), 6 (8), 7 (14), 8 (2), 9 (40) |
| `shape_area`, `shape_leng` | Area and perimeter, as strings |

## Caveats

- Only NYC is covered.
  A station outside every polygon is assigned to the nearest one. All current stations fall inside an NTA.
- Some NTAs are parks, airports, or cemeteries, and will have no stations.
- Numeric properties arrive as strings.

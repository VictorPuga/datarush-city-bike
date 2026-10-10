"""Assign stations to NYC Neighborhood Tabulation Areas into ui/src/data/regions.json."""

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIONS = ROOT / "ui" / "src" / "data" / "stations.json"
DEFAULT_NTA = ROOT / "tmp" / "nta.geojson"
OUTPUT = ROOT / "ui" / "src" / "data" / "regions.json"
PRECISION = 5


def ring_contains(ring, x, y):
  inside = False
  j = len(ring) - 1
  for i in range(len(ring)):
    xi, yi = ring[i]
    xj, yj = ring[j]
    if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
      inside = not inside
    j = i
  return inside


def polygons_contain(polygons, x, y):
  return any(
    ring_contains(polygon[0], x, y) and not any(ring_contains(hole, x, y) for hole in polygon[1:])
    for polygon in polygons
  )


def bounding_box(polygons):
  points = [point for polygon in polygons for point in polygon[0]]
  xs = [point[0] for point in points]
  ys = [point[1] for point in points]
  return min(xs), min(ys), max(xs), max(ys)


def perpendicular_distance(point, start, end):
  dx, dy = end[0] - start[0], end[1] - start[1]
  if dx == 0 and dy == 0:
    return math.hypot(point[0] - start[0], point[1] - start[1])
  t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)
  t = max(0, min(1, t))
  return math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))


def douglas_peucker(points, tolerance):
  keep = [False] * len(points)
  keep[0] = keep[-1] = True
  stack = [(0, len(points) - 1)]
  while stack:
    first, last = stack.pop()
    worst, index = 0, None
    for i in range(first + 1, last):
      distance = perpendicular_distance(points[i], points[first], points[last])
      if distance > worst:
        worst, index = distance, i
    if index is not None and worst > tolerance:
      keep[index] = True
      stack.append((first, index))
      stack.append((index, last))
  return [point for point, kept in zip(points, keep) if kept]


def simplify_ring(ring, tolerance):
  simplified = douglas_peucker(ring[:-1], tolerance)
  if len(simplified) < 3:
    return None
  rounded = [[round(x, PRECISION), round(y, PRECISION)] for x, y in simplified]
  return rounded + [rounded[0]]


def simplify_polygons(polygons, tolerance):
  result = []
  for polygon in polygons:
    outer = simplify_ring(polygon[0], tolerance)
    if outer is None:
      continue
    holes = [ring for ring in (simplify_ring(hole, tolerance) for hole in polygon[1:]) if ring]
    result.append([outer, *holes])
  return result


def distance_to_polygons(polygons, x, y):
  return min(math.hypot(px - x, py - y) for polygon in polygons for px, py in polygon[0])


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--nta", type=Path, default=DEFAULT_NTA, help=f"NTA GeoJSON (default: {DEFAULT_NTA.relative_to(ROOT)})")
  parser.add_argument("--tolerance", type=float, default=0.00005, help="simplification tolerance in degrees (default: 0.00005, about 5 m)")
  args = parser.parse_args()

  if not args.nta.exists():
    sys.exit(f"{args.nta} not found, see docs/nta-dataset.md for the download command")

  features = json.loads(args.nta.read_text())["features"]
  stations = json.loads(STATIONS.read_text())

  regions = []
  for feature in features:
    polygons = feature["geometry"]["coordinates"]
    properties = feature["properties"]
    regions.append(
      {
        "id": properties["nta2020"],
        "name": properties["ntaname"],
        "borough": properties["boroname"],
        "polygons": polygons,
        "box": bounding_box(polygons),
        "members": [],
      }
    )

  assignments = {}
  fallbacks = 0
  for station in stations:
    x, y = station["lon"], station["lat"]
    match = next(
      (
        region
        for region in regions
        if region["box"][0] <= x <= region["box"][2]
        and region["box"][1] <= y <= region["box"][3]
        and polygons_contain(region["polygons"], x, y)
      ),
      None,
    )
    if match is None:
      match = min(regions, key=lambda region: distance_to_polygons(region["polygons"], x, y))
      fallbacks += 1
    match["members"].append(station)
    assignments[station["id"]] = match["id"]

  output = []
  for region in regions:
    members = region["members"]
    trips = sum(s["trips"] for s in members)
    if members:
      lat = sum(s["lat"] for s in members) / len(members)
      lon = sum(s["lon"] for s in members) / len(members)
    else:
      lon, lat = (region["box"][0] + region["box"][2]) / 2, (region["box"][1] + region["box"][3]) / 2
    output.append(
      {
        "id": region["id"],
        "name": region["name"],
        "borough": region["borough"],
        "lat": round(lat, PRECISION),
        "lon": round(lon, PRECISION),
        "stations": len(members),
        "trips": trips,
        "electricShare": round(sum(s["electricShare"] * s["trips"] for s in members) / trips, 3) if trips else 0,
        "polygons": simplify_polygons(region["polygons"], args.tolerance),
      }
    )

  OUTPUT.write_text(json.dumps({"assignments": assignments, "regions": output}, separators=(",", ":")) + "\n")
  empty = sum(1 for region in output if not region["stations"])
  print(
    f"wrote {len(output)} regions ({empty} empty) to {OUTPUT}; "
    f"{fallbacks} stations outside every polygon assigned to the nearest region"
  )


if __name__ == "__main__":
  main()

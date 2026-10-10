"""Cluster stations by location with k-means into ui/src/data/clusters.json."""

import argparse
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "ui" / "src" / "data" / "stations.json"
OUTPUT = ROOT / "ui" / "src" / "data" / "clusters.json"
EARTH_RADIUS_M = 6371000


def project(stations):
  mean_lat = sum(s["lat"] for s in stations) / len(stations)
  lon_scale = math.cos(math.radians(mean_lat))
  scale = math.radians(1) * EARTH_RADIUS_M
  return [(s["lon"] * lon_scale * scale, s["lat"] * scale) for s in stations], lon_scale, scale


def squared_distance(a, b):
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def nearest(point, centroids):
  best, best_distance = 0, math.inf
  for index, centroid in enumerate(centroids):
    distance = squared_distance(point, centroid)
    if distance < best_distance:
      best, best_distance = index, distance
  return best, best_distance


def initial_centroids(points, k, rng):
  centroids = [points[rng.randrange(len(points))]]
  while len(centroids) < k:
    weights = [nearest(point, centroids)[1] for point in points]
    centroids.append(rng.choices(points, weights=weights)[0])
  return centroids


def kmeans(points, k, rng, max_iterations=100):
  centroids = initial_centroids(points, k, rng)
  labels = [-1] * len(points)
  for _ in range(max_iterations):
    new_labels = [nearest(point, centroids)[0] for point in points]
    if new_labels == labels:
      break
    labels = new_labels
    sums = [[0.0, 0.0, 0] for _ in range(k)]
    for point, label in zip(points, labels):
      sums[label][0] += point[0]
      sums[label][1] += point[1]
      sums[label][2] += 1
    for index, (x, y, count) in enumerate(sums):
      if count:
        centroids[index] = (x / count, y / count)
  inertia = sum(squared_distance(point, centroids[label]) for point, label in zip(points, labels))
  return labels, inertia


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("-k", type=int, default=150, help="number of clusters (default: 150)")
  parser.add_argument("--seed", type=int, default=42, help="random seed (default: 42)")
  parser.add_argument("--restarts", type=int, default=10, help="k-means++ restarts, best inertia wins (default: 10)")
  args = parser.parse_args()

  stations = json.loads(INPUT.read_text())
  points, _, _ = project(stations)
  rng = random.Random(args.seed)

  labels, _ = min((kmeans(points, args.k, rng) for _ in range(args.restarts)), key=lambda result: result[1])

  members = {}
  for station, label in zip(stations, labels):
    members.setdefault(label, []).append(station)

  ordered = sorted(members.values(), key=lambda group: sum(s["trips"] for s in group), reverse=True)
  clusters = []
  assignments = {}
  for index, group in enumerate(ordered):
    for station in group:
      assignments[station["id"]] = index
    trips = sum(s["trips"] for s in group)
    clusters.append(
      {
        "id": index,
        "lat": round(sum(s["lat"] for s in group) / len(group), 5),
        "lon": round(sum(s["lon"] for s in group) / len(group), 5),
        "stations": len(group),
        "trips": trips,
        "electricShare": round(sum(s["electricShare"] * s["trips"] for s in group) / trips, 3),
      }
    )

  OUTPUT.write_text(json.dumps({"assignments": assignments, "clusters": clusters}, indent=2) + "\n")
  print(f"wrote {len(clusters)} clusters to {OUTPUT}")


if __name__ == "__main__":
  main()

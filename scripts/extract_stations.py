"""Derive the top stations from raw Citi Bike trip files into ui/src/data/stations.json."""

import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUTPUT = ROOT / "ui" / "src" / "data" / "stations.json"
TOP_N = 50


def open_sources():
  for path in sorted(RAW_DIR.rglob("*.csv")):
    yield path.name, open(path, newline="", encoding="utf-8")
  for path in sorted(RAW_DIR.rglob("*.zip")):
    with zipfile.ZipFile(path) as archive:
      for name in archive.namelist():
        if name.endswith(".csv") and not name.startswith("__MACOSX"):
          yield name, io.TextIOWrapper(archive.open(name), encoding="utf-8", newline="")


def main():
  stats = defaultdict(lambda: {"name": "", "lat": 0.0, "lon": 0.0, "trips": 0, "electric": 0})

  for name, handle in open_sources():
    print(f"reading {name}", file=sys.stderr)
    with handle:
      for row in csv.DictReader(handle):
        station_id = row["start_station_id"]
        try:
          lat = float(row["start_lat"])
          lon = float(row["start_lng"])
        except ValueError:
          continue
        if not station_id:
          continue
        entry = stats[station_id]
        entry["name"] = row["start_station_name"]
        entry["lat"] += lat
        entry["lon"] += lon
        entry["trips"] += 1
        if row["rideable_type"] == "electric_bike":
          entry["electric"] += 1

  if not stats:
    sys.exit(f"no trip files found in {RAW_DIR}")

  top = sorted(stats.items(), key=lambda item: item[1]["trips"], reverse=True)[:TOP_N]
  stations = [
    {
      "id": station_id,
      "name": entry["name"],
      "lat": round(entry["lat"] / entry["trips"], 5),
      "lon": round(entry["lon"] / entry["trips"], 5),
      "trips": entry["trips"],
      "electricShare": round(entry["electric"] / entry["trips"], 3),
    }
    for station_id, entry in top
  ]

  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  OUTPUT.write_text(json.dumps(stations, indent=2) + "\n")
  print(f"wrote {len(stations)} stations to {OUTPUT}", file=sys.stderr)


if __name__ == "__main__":
  main()

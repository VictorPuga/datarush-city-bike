# API

The Next.js API serves the forecasts of the ONNX model, see [inference.md](inference.md).
Requests return 503 if the model files in `ui/models/` are missing.

## Predictions

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

## Day forecast

`GET /api/predictions/day?date=YYYY-MM-DD&station=ID` returns `{ date, weather, station, slots: [{ slot, ...counts, departures, arrivals }] }` with 96 entries, used by the station chart.

## Weather

`GET /api/weather?date=YYYY-MM-DD` returns `{ date, weather, hours }` with 24 `{ hour, temperature, humidity, wind, precipitation, code }` entries (°C, %, km/h, mm in the hour, WMO weather code).
It reads the same Open-Meteo values the model uses, and `weather` is `default` when they are unavailable.

## Insights

`GET /api/insights?date=YYYY-MM-DD&slot=0-95` returns `{ date, slot, week, netFlow }`.
`week` has the Monday to Sunday days around `date`, each with 96 citywide `{ classic, electric, depClassic, depElectric }` slots.
`netFlow` has one `{ id, classic, electric }` per neighborhood: arrivals minus departures during `slot`.

import type { NextRequest } from 'next/server';
import { arrivalCounts, departureCounts, getForecast, modelStations, stockCounts } from '@/lib/model';
import { isValidDate, stations } from '@/lib/stations';
import { SLOTS_PER_DAY } from '@/lib/time';
import type { StationDayResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') ?? '';
  const stationId = searchParams.get('station') ?? '';

  if (!isValidDate(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const station = stations.find((item) => item.id === stationId);
  if (!station) {
    return Response.json({ error: 'unknown station' }, { status: 404 });
  }

  try {
    const [forecast, covered] = await Promise.all([getForecast(date), modelStations()]);
    const model = covered.find((item) => item.id === stationId);
    if (!model) {
      return Response.json({ error: 'station not covered by the model' }, { status: 404 });
    }
    const body: StationDayResponse = {
      date,
      weather: forecast.weather,
      station: { id: station.id, name: station.name, lat: station.lat, lon: station.lon },
      slots: Array.from({ length: SLOTS_PER_DAY }, (_, slot) => ({
        slot,
        ...stockCounts(forecast, model.index, slot),
        departures: departureCounts(forecast, model.index, slot),
        arrivals: arrivalCounts(forecast, model.index, slot),
      })),
    };
    return Response.json(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'inference failed' }, { status: 503 });
  }
}

import type { NextRequest } from 'next/server';
import { arrivalCounts, departureCounts, getForecast, modelStations, regionPredictions, stockCounts } from '@/lib/model';
import { isValidDate, isValidSlot, stations } from '@/lib/stations';
import type { PredictionsResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') ?? '';
  const slotParam = searchParams.get('slot') ?? '';

  if (!isValidDate(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (!isValidSlot(slotParam)) {
    return Response.json({ error: 'slot must be an integer from 0 to 95' }, { status: 400 });
  }

  const slot = Number(slotParam);
  try {
    const [forecast, covered] = await Promise.all([getForecast(date), modelStations()]);
    const regions = await regionPredictions(forecast, slot);
    const byId = new Map(stations.map((station) => [station.id, station]));
    const body: PredictionsResponse = {
      date,
      slot,
      weather: forecast.weather,
      stations: covered.map(({ id, index }) => {
        const station = byId.get(id)!;
        return {
          id,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          ...stockCounts(forecast, index, slot),
          departures: departureCounts(forecast, index, slot),
          arrivals: arrivalCounts(forecast, index, slot),
        };
      }),
      regions,
    };
    return Response.json(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'inference failed' }, { status: 503 });
  }
}

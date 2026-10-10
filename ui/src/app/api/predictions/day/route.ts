import type { NextRequest } from 'next/server';
import { isValidDate, predictCounts, stations } from '@/lib/mock';
import type { StationDayResponse } from '@/lib/types';

export function GET(request: NextRequest) {
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

  const body: StationDayResponse = {
    date,
    station: { id: station.id, name: station.name, lat: station.lat, lon: station.lon },
    hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ...predictCounts(station, date, hour),
    })),
  };
  return Response.json(body);
}

import type { NextRequest } from 'next/server';
import { isValidDate, isValidHour, predictCounts, stations } from '@/lib/mock';
import type { PredictionsResponse } from '@/lib/types';

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date') ?? '';
  const hourParam = searchParams.get('hour') ?? '';

  if (!isValidDate(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (!isValidHour(hourParam)) {
    return Response.json({ error: 'hour must be an integer from 0 to 23' }, { status: 400 });
  }

  const hour = Number(hourParam);
  const body: PredictionsResponse = {
    date,
    hour,
    stations: stations.map((station) => ({
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      ...predictCounts(station, date, hour),
    })),
  };
  return Response.json(body);
}

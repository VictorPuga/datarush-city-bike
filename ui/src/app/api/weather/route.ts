import type { NextRequest } from 'next/server';
import { isValidDate } from '@/lib/stations';
import type { WeatherResponse } from '@/lib/types';
import { getWeather, hoursFromClima } from '@/lib/weather';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!isValidDate(date)) {
    return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  const { source, clima } = await getWeather(date);
  const body: WeatherResponse = { date, weather: source, hours: hoursFromClima(clima) };
  return Response.json(body);
}

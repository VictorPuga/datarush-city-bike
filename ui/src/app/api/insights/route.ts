import type { NextRequest } from 'next/server';
import { dayTotals, netFlow, weekDates } from '@/lib/insights';
import { isValidDate, isValidHour } from '@/lib/mock';
import type { InsightsResponse } from '@/lib/types';

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
  const body: InsightsResponse = {
    date,
    hour,
    week: weekDates(date).map(dayTotals),
    netFlow: netFlow(date, hour),
  };
  return Response.json(body);
}

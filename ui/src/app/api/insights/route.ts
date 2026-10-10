import type { NextRequest } from 'next/server';
import { dayTotals, netFlow, weekDates } from '@/lib/insights';
import { isValidDate, isValidSlot } from '@/lib/stations';
import type { InsightsResponse } from '@/lib/types';

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
    const [week, flow] = await Promise.all([Promise.all(weekDates(date).map(dayTotals)), netFlow(date, slot)]);
    const body: InsightsResponse = { date, slot, week, netFlow: flow };
    return Response.json(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'inference failed' }, { status: 503 });
  }
}

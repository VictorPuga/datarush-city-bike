const pad = (value: number) => String(value).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return iso(year, month, 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  return iso(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}

function observed(year: number, month: number, day: number): string[] {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  const dates = [iso(year, month, day)];
  if (dow === 6 || dow === 0) {
    const shifted = new Date(date.getTime() + (dow === 6 ? -1 : 1) * 86_400_000);
    dates.push(shifted.toISOString().slice(0, 10));
  }
  return dates;
}

function holidays(year: number): Set<string> {
  return new Set([
    ...observed(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    lastWeekday(year, 5, 1),
    ...observed(year, 6, 19),
    ...observed(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 10, 1, 2),
    ...observed(year, 11, 11),
    nthWeekday(year, 11, 4, 4),
    ...observed(year, 12, 25),
  ]);
}

export function isHoliday(date: string): boolean {
  return holidays(Number(date.slice(0, 4))).has(date);
}

export function modelWeekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

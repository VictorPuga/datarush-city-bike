export const SLOTS_PER_DAY = 96;
export const SLOTS_PER_HOUR = 4;

const pad = (value: number) => String(value).padStart(2, '0');

export function formatSlot(slot: number): string {
  const wrapped = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;
  return `${pad(Math.floor(wrapped / SLOTS_PER_HOUR))}:${pad((wrapped % SLOTS_PER_HOUR) * 15)}`;
}

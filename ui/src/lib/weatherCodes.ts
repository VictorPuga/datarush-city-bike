const CODES: [number[], string, string][] = [
  [[0], 'Clear', '☀️'],
  [[1, 2], 'Partly cloudy', '⛅'],
  [[3], 'Overcast', '☁️'],
  [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '🌨️'],
  [[95, 96, 99], 'Thunderstorm', '⛈️'],
];

/** Label and emoji of a WMO weather code. */
export function describeCode(code: number): { label: string; icon: string } {
  const [, label, icon] = CODES.find(([codes]) => codes.includes(code)) ?? [[], 'Unknown', '🌡️'];
  return { label, icon };
}

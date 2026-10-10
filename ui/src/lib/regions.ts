import regionsData from '@/data/regions.json';
import type { LatLngTuple } from 'leaflet';

type RegionData = (typeof regionsData.regions)[number];

const assignments: Record<string, string> = regionsData.assignments;

export type RegionShape = Pick<RegionData, 'id' | 'name' | 'borough' | 'lat' | 'lon'> & {
  positions: LatLngTuple[][][];
};

export const regionShapes: RegionShape[] = regionsData.regions.map((region) => ({
  id: region.id,
  name: region.name,
  borough: region.borough,
  lat: region.lat,
  lon: region.lon,
  positions: region.polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([lon, lat]): LatLngTuple => [lat, lon])),
  ),
}));

export function regionIdOf(stationId: string): string | undefined {
  return assignments[stationId];
}

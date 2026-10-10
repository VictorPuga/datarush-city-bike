import regionsData from '@/data/regions.json';
import type { LatLngTuple } from 'leaflet';
import type { RegionPrediction, StationPrediction } from './types';

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

export function aggregateRegions(stations: StationPrediction[]): RegionPrediction[] {
  const totals = new Map<string, RegionPrediction>(
    regionShapes.map((shape) => [
      shape.id,
      {
        id: shape.id,
        name: shape.name,
        borough: shape.borough,
        lat: shape.lat,
        lon: shape.lon,
        stations: 0,
        classic: 0,
        classicLow: 0,
        classicHigh: 0,
        electric: 0,
        electricLow: 0,
        electricHigh: 0,
      },
    ]),
  );
  for (const station of stations) {
    const region = totals.get(assignments[station.id]);
    if (!region) continue;
    region.stations += 1;
    region.classic += station.classic;
    region.classicLow += station.classicLow;
    region.classicHigh += station.classicHigh;
    region.electric += station.electric;
    region.electricLow += station.electricLow;
    region.electricHigh += station.electricHigh;
  }
  return [...totals.values()];
}

import clustersData from '@/data/clusters.json';
import type { ClusterPrediction, StationPrediction } from './types';

const assignments: Record<string, number> = clustersData.assignments;
const centroids = new Map(clustersData.clusters.map((cluster) => [cluster.id, cluster]));

export function clusterIdOf(stationId: string): number | undefined {
  return assignments[stationId];
}

export function aggregateClusters(stations: StationPrediction[]): ClusterPrediction[] {
  const totals = new Map<number, ClusterPrediction>();
  for (const station of stations) {
    const id = assignments[station.id];
    const centroid = centroids.get(id);
    if (!centroid) continue;
    let cluster = totals.get(id);
    if (!cluster) {
      cluster = {
        id,
        lat: centroid.lat,
        lon: centroid.lon,
        stations: 0,
        classic: 0,
        classicLow: 0,
        classicHigh: 0,
        electric: 0,
        electricLow: 0,
        electricHigh: 0,
      };
      totals.set(id, cluster);
    }
    cluster.stations += 1;
    cluster.classic += station.classic;
    cluster.classicLow += station.classicLow;
    cluster.classicHigh += station.classicHigh;
    cluster.electric += station.electric;
    cluster.electricLow += station.electricLow;
    cluster.electricHigh += station.electricHigh;
  }
  return [...totals.values()];
}

export function clusterLabel(id: number): string {
  return `Cluster ${id + 1}`;
}

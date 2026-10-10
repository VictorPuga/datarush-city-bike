import { ResponsiveBar } from '@nivo/bar';
import { useMemo } from 'react';
import stationsData from '@/data/stations.json';
import { nivoTheme } from '@/lib/nivoTheme';
import type { StationInfo } from '@/lib/types';
import styles from './Insights.module.css';

type DemandHistogramProps = {
  selectedId: string | null;
  stationIds: Set<string>;
};

const BINS = 8;
const stations = stationsData as StationInfo[];

function compact(value: number): string {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(Math.round(value));
}

function histogram(active: StationInfo[]) {
  if (active.length === 0) return { bins: [], binOf: () => -1 };
  const logs = active.map((station) => Math.log10(Math.max(1, station.trips)));
  const minLog = Math.min(...logs);
  const step = (Math.max(...logs) - minLog) / BINS;
  const binOf = (trips: number) =>
    Math.min(BINS - 1, Math.floor((Math.log10(Math.max(1, trips)) - minLog) / step));
  const bins = Array.from({ length: BINS }, (_, index) => ({
    bin: index,
    label: compact(10 ** (minLog + index * step)),
    stations: 0,
  }));
  for (const station of active) bins[binOf(station.trips)].stations += 1;
  return { bins, binOf };
}

export default function DemandHistogram({ selectedId, stationIds }: DemandHistogramProps) {
  const { bins, binOf } = useMemo(() => histogram(stations.filter((station) => stationIds.has(station.id))), [stationIds]);
  const selected = stations.find((station) => station.id === selectedId);
  const selectedBin = selected ? binOf(selected.trips) : -1;

  return (
    <>
      <div className={styles.chart} role="img" aria-label="Number of stations by total trips">
        <ResponsiveBar
          data={bins}
          keys={['stations']}
          indexBy="label"
          theme={nivoTheme}
          margin={{ top: 12, right: 8, bottom: 40, left: 44 }}
          padding={0.1}
          colors={(bar) => (bar.data.bin === selectedBin ? '#ff9500' : '#007aff')}
          axisBottom={{ legend: 'Trips per station (log scale)', legendOffset: 34, legendPosition: 'middle' }}
          axisLeft={{ tickValues: 5 }}
          enableLabel={false}
          enableGridX={false}
        />
      </div>
      {selected && (
        <p className={styles.note}>
          {selected.name}: {selected.trips.toLocaleString('en-US')} trips (orange bar).
        </p>
      )}
    </>
  );
}

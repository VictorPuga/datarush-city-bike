import { ResponsiveBar } from '@nivo/bar';
import stationsData from '@/data/stations.json';
import { nivoTheme } from '@/lib/nivoTheme';
import type { StationInfo } from '@/lib/types';
import styles from './Insights.module.css';

type DemandHistogramProps = {
  selectedId: string | null;
};

const BINS = 8;
const stations = stationsData as StationInfo[];
const logs = stations.map((station) => Math.log10(Math.max(1, station.trips)));
const minLog = Math.min(...logs);
const step = (Math.max(...logs) - minLog) / BINS;

function binOf(trips: number): number {
  return Math.min(BINS - 1, Math.floor((Math.log10(Math.max(1, trips)) - minLog) / step));
}

function compact(value: number): string {
  return value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(Math.round(value));
}

const HISTOGRAM = Array.from({ length: BINS }, (_, index) => ({
  bin: index,
  label: compact(10 ** (minLog + index * step)),
  stations: 0,
}));
for (const station of stations) HISTOGRAM[binOf(station.trips)].stations += 1;

export default function DemandHistogram({ selectedId }: DemandHistogramProps) {
  const selected = stations.find((station) => station.id === selectedId);
  const selectedBin = selected ? binOf(selected.trips) : -1;

  return (
    <>
      <div className={styles.chart} role="img" aria-label="Number of stations by total trips">
        <ResponsiveBar
          data={HISTOGRAM}
          keys={['stations']}
          indexBy="label"
          theme={nivoTheme}
          margin={{ top: 12, right: 8, bottom: 40, left: 44 }}
          padding={0.1}
          colors={(bar) => (bar.data.bin === selectedBin ? '#e4572e' : '#2563eb')}
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

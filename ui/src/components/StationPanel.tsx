import { formatCount } from '@/lib/density';
import type { Metric, RegionPrediction, StationDayResponse, StationPrediction } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import StationChart from './StationChart';
import styles from './StationPanel.module.css';

type StationPanelProps = {
  station: StationPrediction;
  region?: RegionPrediction;
  slot: number;
  metric: Metric;
  day?: StationDayResponse;
  loading: boolean;
  error?: string;
  onSlotChange: (slot: number) => void;
  onClose: () => void;
  onRetry: () => void;
};

export default function StationPanel({
  station,
  region,
  slot,
  metric,
  day,
  loading,
  error,
  onSlotChange,
  onClose,
  onRetry,
}: StationPanelProps) {
  return (
    <section className={styles.panel} aria-label="Selected station">
      <header className={styles.header}>
        <h2>{station.name}</h2>
        <button type="button" onClick={onClose} aria-label="Clear selection">
          ×
        </button>
      </header>
      {region && (
        <p className={styles.region}>
          {region.name}, {region.borough} · {region.stations} stations · {formatCount(region.classic)} classic,{' '}
          {formatCount(region.electric)} electric
        </p>
      )}
      <dl className={styles.counts}>
        <div>
          <dt>
            <ClassicBikeIcon /> Classic
          </dt>
          <dd>{formatCount(station.classic)}</dd>
          <small>
            {formatCount(station.classicLow)}–{formatCount(station.classicHigh)}
          </small>
        </div>
        <div>
          <dt>
            <ElectricBikeIcon /> Electric
          </dt>
          <dd>{formatCount(station.electric)}</dd>
          <small>
            {formatCount(station.electricLow)}–{formatCount(station.electricHigh)}
          </small>
        </div>
      </dl>
      {day && <StationChart slots={day.slots} slot={slot} metric={metric} onSlotChange={onSlotChange} />}
      {loading && <p className={styles.status}>Loading day forecast…</p>}
      {error && (
        <p role="alert" className={styles.status}>
          {error}{' '}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}

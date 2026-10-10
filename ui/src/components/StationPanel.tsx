import { clusterLabel } from '@/lib/clusters';
import type { ClusterPrediction, StationDayResponse, StationPrediction } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import StationChart from './StationChart';
import styles from './StationPanel.module.css';

type StationPanelProps = {
  station: StationPrediction;
  cluster?: ClusterPrediction;
  hour: number;
  day?: StationDayResponse;
  loading: boolean;
  error?: string;
  onHourChange: (hour: number) => void;
  onClose: () => void;
  onRetry: () => void;
};

export default function StationPanel({
  station,
  cluster,
  hour,
  day,
  loading,
  error,
  onHourChange,
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
      {cluster && (
        <p className={styles.cluster}>
          {clusterLabel(cluster.id)} · {cluster.stations} stations · {cluster.classic} classic, {cluster.electric}{' '}
          electric
        </p>
      )}
      <dl className={styles.counts}>
        <div>
          <dt>
            <ClassicBikeIcon /> Classic
          </dt>
          <dd>{station.classic}</dd>
          <small>
            {station.classicLow}–{station.classicHigh}
          </small>
        </div>
        <div>
          <dt>
            <ElectricBikeIcon /> Electric
          </dt>
          <dd>{station.electric}</dd>
          <small>
            {station.electricLow}–{station.electricHigh}
          </small>
        </div>
      </dl>
      {day && <StationChart hours={day.hours} hour={hour} onHourChange={onHourChange} />}
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

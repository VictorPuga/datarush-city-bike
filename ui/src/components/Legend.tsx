import { maxFor, RAMP } from '@/lib/density';
import type { Metric } from '@/lib/types';
import styles from './Legend.module.css';

type LegendProps = {
  metric: Metric;
};

const LABELS: Record<Metric, string> = {
  stock: 'Bikes per station',
  departures: 'Departures per station in 15 min',
  arrivals: 'Arrivals per station in 15 min',
};

export default function Legend({ metric }: LegendProps) {
  return (
    <div className={styles.legend}>
      <span className={styles.title}>
        {LABELS[metric]}
      </span>
      <div className={styles.bar} style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
      <div className={styles.labels}>
        <span>0</span>
        <span>{maxFor(metric)}+</span>
      </div>
      <span className={styles.note}>
        Neighborhood color shows the average per station, and gray areas have no stations. Zoom in to see each station.
      </span>
      <span className={styles.note}>
        Ranges are 80% ranges calibrated on held-out weeks. The stock baseline is an assumption.
      </span>
    </div>
  );
}

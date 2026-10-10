import { maxFor, RAMP } from '@/lib/density';
import type { Metric } from '@/lib/types';
import styles from './Legend.module.css';

type LegendProps = {
  metric: Metric;
};

export default function Legend({ metric }: LegendProps) {
  return (
    <div className={styles.legend}>
      <span className={styles.title}>
        {metric === 'stock' ? 'Bikes per station' : 'Departures per station in 15 min'}
      </span>
      <div className={styles.bar} style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
      <div className={styles.labels}>
        <span>0</span>
        <span>{maxFor(metric)}+</span>
      </div>
      <span className={styles.note}>
        Neighborhood color shows the average per station, and gray areas have no stations. Zoom in to see each station.
      </span>
    </div>
  );
}

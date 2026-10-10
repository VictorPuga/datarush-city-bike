import { MAX_BIKES, RAMP } from '@/lib/density';
import type { View } from '@/lib/types';
import styles from './Legend.module.css';

type LegendProps = {
  view: View;
};

export default function Legend({ view }: LegendProps) {
  return (
    <div className={styles.legend}>
      <span className={styles.title}>Bikes per station</span>
      <div className={styles.bar} style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
      <div className={styles.labels}>
        <span>0</span>
        <span>{MAX_BIKES}+</span>
      </div>
      <span className={styles.note}>
        {view === 'regions'
          ? 'Neighborhood color shows bikes per station. Gray areas have no stations.'
          : 'Circle size and color grow with the predicted count.'}
      </span>
    </div>
  );
}

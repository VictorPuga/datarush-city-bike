import { MAX_BIKES, RAMP } from '@/lib/density';
import styles from './Legend.module.css';

export default function Legend() {
  return (
    <div className={styles.legend}>
      <span className={styles.title}>Bikes per station</span>
      <div className={styles.bar} style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
      <div className={styles.labels}>
        <span>0</span>
        <span>{MAX_BIKES}+</span>
      </div>
      <span className={styles.note}>
        Neighborhood color shows bikes per station, and gray areas have no stations. Zoom in to see each station.
      </span>
    </div>
  );
}

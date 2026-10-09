import type { StationPrediction } from '@/lib/types';
import styles from './Summary.module.css';

type SummaryProps = {
  stations: StationPrediction[];
};

export default function Summary({ stations }: SummaryProps) {
  const classic = stations.reduce((sum, station) => sum + station.classic, 0);
  const electric = stations.reduce((sum, station) => sum + station.electric, 0);

  return (
    <dl className={styles.summary}>
      <div>
        <dt>Classic</dt>
        <dd>{classic}</dd>
      </div>
      <div>
        <dt>Electric</dt>
        <dd>{electric}</dd>
      </div>
      <div>
        <dt>Total</dt>
        <dd>{classic + electric}</dd>
      </div>
      <div>
        <dt>Stations</dt>
        <dd>{stations.length}</dd>
      </div>
    </dl>
  );
}

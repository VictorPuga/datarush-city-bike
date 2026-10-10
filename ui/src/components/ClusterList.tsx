import { clusterLabel } from '@/lib/clusters';
import { layerValue } from '@/lib/density';
import type { ClusterPrediction, Layer } from '@/lib/types';
import styles from './ClusterList.module.css';

type ClusterListProps = {
  clusters: ClusterPrediction[];
  layer: Layer;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function ClusterList({ clusters, layer, selectedId, onSelect }: ClusterListProps) {
  const ranked = [...clusters].sort((a, b) => layerValue(b, layer) - layerValue(a, layer));

  return (
    <section aria-label="Clusters">
      <h2 className={styles.title}>Clusters by predicted bikes</h2>
      <ol className={styles.list}>
        {ranked.map((cluster) => (
          <li key={cluster.id}>
            <button
              type="button"
              className={styles.item}
              aria-current={selectedId === cluster.id}
              onClick={() => onSelect(cluster.id)}
            >
              <span>
                {clusterLabel(cluster.id)}
                <small>{cluster.stations} stations</small>
              </span>
              <strong>{layerValue(cluster, layer)}</strong>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

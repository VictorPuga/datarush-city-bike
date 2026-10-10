import { layerValue } from '@/lib/density';
import type { Layer, RegionPrediction } from '@/lib/types';
import styles from './RegionList.module.css';

type RegionListProps = {
  regions: RegionPrediction[];
  layer: Layer;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function RegionList({ regions, layer, selectedId, onSelect }: RegionListProps) {
  const ranked = regions
    .filter((region) => region.stations > 0)
    .sort((a, b) => layerValue(b, layer) - layerValue(a, layer));

  return (
    <section aria-label="Regions">
      <h2 className={styles.title}>Neighborhoods by predicted bikes</h2>
      <ol className={styles.list}>
        {ranked.map((region) => (
          <li key={region.id}>
            <button
              type="button"
              className={styles.item}
              aria-current={selectedId === region.id}
              onClick={() => onSelect(region.id)}
            >
              <span>
                {region.name}
                <small>
                  {region.borough} · {region.stations} stations
                </small>
              </span>
              <strong>{layerValue(region, layer)}</strong>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

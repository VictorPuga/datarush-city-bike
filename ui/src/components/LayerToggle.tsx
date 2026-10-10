import type { Layer } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import styles from './LayerToggle.module.css';

type LayerToggleProps = {
  layer: Layer;
  onChange: (layer: Layer) => void;
};

const OPTIONS: { value: Layer; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'classic', label: 'Classic' },
  { value: 'electric', label: 'Electric' },
];

export default function LayerToggle({ layer, onChange }: LayerToggleProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Bike type">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={layer === option.value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.value === 'classic' && <ClassicBikeIcon />}
          {option.value === 'electric' && <ElectricBikeIcon />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

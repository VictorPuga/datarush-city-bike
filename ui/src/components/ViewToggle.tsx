import type { View } from '@/lib/types';
import styles from './LayerToggle.module.css';

type ViewToggleProps = {
  view: View;
  onChange: (view: View) => void;
};

const OPTIONS: { value: View; label: string }[] = [
  { value: 'stations', label: 'Stations' },
  { value: 'clusters', label: 'Clusters' },
];

export default function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Map view">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={view === option.value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

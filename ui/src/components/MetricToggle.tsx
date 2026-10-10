import type { Metric } from '@/lib/types';
import styles from './LayerToggle.module.css';

type MetricToggleProps = {
  metric: Metric;
  onChange: (metric: Metric) => void;
};

const OPTIONS: { value: Metric; label: string }[] = [
  { value: 'stock', label: 'Bikes available' },
  { value: 'departures', label: 'Departures' },
  { value: 'arrivals', label: 'Arrivals' },
];

export default function MetricToggle({ metric, onChange }: MetricToggleProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Metric">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={metric === option.value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

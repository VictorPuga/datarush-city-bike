'use client';

import styles from './Controls.module.css';

type ControlsProps = {
  date: string;
  hour: number;
  onDateChange: (date: string) => void;
  onHourChange: (hour: number) => void;
};

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export default function Controls({ date, hour, onDateChange, onHourChange }: ControlsProps) {
  return (
    <div className={styles.controls}>
      <label className={styles.field}>
        <span>Date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && onDateChange(event.target.value)}
        />
      </label>
      <label className={`${styles.field} ${styles.slider}`}>
        <span>Hour: {formatHour(hour)}</span>
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={hour}
          onChange={(event) => onHourChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

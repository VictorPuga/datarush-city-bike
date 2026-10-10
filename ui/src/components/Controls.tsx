'use client';

import { formatSlot, SLOTS_PER_DAY } from '@/lib/time';
import styles from './Controls.module.css';

type ControlsProps = {
  date: string;
  slot: number;
  onDateChange: (date: string) => void;
  onSlotChange: (slot: number) => void;
};

export default function Controls({ date, slot, onDateChange, onSlotChange }: ControlsProps) {
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
        <span>Time: {formatSlot(slot)}</span>
        <input
          type="range"
          min={0}
          max={SLOTS_PER_DAY - 1}
          step={1}
          value={slot}
          onChange={(event) => onSlotChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { PredictionsResponse } from '@/lib/types';
import Controls from './Controls';
import styles from './Dashboard.module.css';
import Summary from './Summary';

const BikeMap = dynamic(() => import('./Map'), { ssr: false });

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

type Result = { key: string; data?: PredictionsResponse; error?: string };

export default function Dashboard() {
  const [date, setDate] = useState(todayISO);
  const [hour, setHour] = useState(8);
  const [result, setResult] = useState<Result | null>(null);

  const key = `${date}|${hour}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/predictions?date=${date}&hour=${hour}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json() as Promise<PredictionsResponse>;
      })
      .then((data) => setResult({ key: `${date}|${hour}`, data }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setResult({ key: `${date}|${hour}`, error: error.message });
        }
      });
    return () => controller.abort();
  }, [date, hour]);

  const current = result?.key === key ? result : null;
  const stations = (current?.data ?? result?.data)?.stations ?? [];

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <h1>NYC bike availability forecast</h1>
        <Controls date={date} hour={hour} onDateChange={setDate} onHourChange={setHour} />
        <Summary stations={stations} />
        {current?.error && <p role="alert">{current.error}</p>}
      </header>
      <div className={styles.map}>
        <BikeMap stations={stations} />
      </div>
    </main>
  );
}

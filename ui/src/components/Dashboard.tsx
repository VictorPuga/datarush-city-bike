'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useJson } from '@/lib/useJson';
import type { Layer, PredictionsResponse, StationDayResponse } from '@/lib/types';
import Controls from './Controls';
import styles from './Dashboard.module.css';
import Legend from './Legend';
import LayerToggle from './LayerToggle';
import StationPanel from './StationPanel';
import StationSearch from './StationSearch';
import Summary from './Summary';

const BikeMap = dynamic(() => import('./Map'), { ssr: false });

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function Dashboard() {
  const [date, setDate] = useState(todayISO);
  const [hour, setHour] = useState(8);
  const [layer, setLayer] = useState<Layer>('both');
  const [showMarkers, setShowMarkers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ id: string; request: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const predictions = useJson<PredictionsResponse>(`/api/predictions?date=${date}&hour=${hour}`);
  const day = useJson<StationDayResponse>(
    selectedId ? `/api/predictions/day?date=${date}&station=${encodeURIComponent(selectedId)}` : null,
  );

  const stations = predictions.data?.stations ?? [];
  const selected = stations.find((station) => station.id === selectedId);

  return (
    <main className={styles.app}>
      <div className={styles.map}>
        <BikeMap
          stations={stations}
          layer={layer}
          showMarkers={showMarkers}
          selectedId={selectedId}
          flyTarget={flyTarget}
          onSelect={setSelectedId}
        />
        {predictions.loading && (
          <div className={styles.loading} role="status">
            Loading predictions…
          </div>
        )}
      </div>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <button
          type="button"
          className={styles.handle}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span className={styles.grip} />
          {collapsed ? 'Show controls' : 'Hide controls'}
        </button>
        <div className={styles.content}>
          <h1>NYC bike availability forecast</h1>
          <Controls date={date} hour={hour} onDateChange={setDate} onHourChange={setHour} />
          <LayerToggle layer={layer} onChange={setLayer} />
          <StationSearch
            stations={stations}
            onSelect={(id) => {
              setSelectedId(id);
              setFlyTarget((previous) => ({ id, request: (previous?.request ?? 0) + 1 }));
            }}
          />
          <Summary stations={stations} />
          <Legend />
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={showMarkers}
            onClick={() => setShowMarkers((value) => !value)}
          >
            {showMarkers ? 'Hide markers' : 'Show markers'}
          </button>
          {predictions.error && (
            <p role="alert" className={styles.error}>
              {predictions.error}{' '}
              <button type="button" onClick={predictions.retry}>
                Retry
              </button>
            </p>
          )}
          {selected && (
            <StationPanel
              station={selected}
              hour={hour}
              day={day.data}
              loading={day.loading}
              error={day.error}
              onHourChange={setHour}
              onClose={() => setSelectedId(null)}
              onRetry={day.retry}
            />
          )}
        </div>
      </aside>
    </main>
  );
}

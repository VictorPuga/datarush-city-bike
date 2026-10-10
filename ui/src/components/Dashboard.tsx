'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { aggregateClusters, clusterIdOf } from '@/lib/clusters';
import { useJson } from '@/lib/useJson';
import type { Layer, PredictionsResponse, StationDayResponse, View } from '@/lib/types';
import type { FlyTarget } from './Map';
import ClusterList from './ClusterList';
import Controls from './Controls';
import styles from './Dashboard.module.css';
import Legend from './Legend';
import LayerToggle from './LayerToggle';
import StationPanel from './StationPanel';
import StationSearch from './StationSearch';
import Summary from './Summary';
import ViewToggle from './ViewToggle';

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
  const [view, setView] = useState<View>('stations');
  const [showMarkers, setShowMarkers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const predictions = useJson<PredictionsResponse>(`/api/predictions?date=${date}&hour=${hour}`);
  const day = useJson<StationDayResponse>(
    selectedId ? `/api/predictions/day?date=${date}&station=${encodeURIComponent(selectedId)}` : null,
  );

  const stations = useMemo(() => predictions.data?.stations ?? [], [predictions.data]);
  const clusters = useMemo(() => aggregateClusters(stations), [stations]);
  const selected = stations.find((station) => station.id === selectedId);
  const selectedStationCluster = clusters.find((cluster) => cluster.id === (selected && clusterIdOf(selected.id)));

  const flyTo = (lat: number, lon: number, zoom: number) =>
    setFlyTarget((previous) => ({ lat, lon, zoom, request: (previous?.request ?? 0) + 1 }));

  return (
    <main className={styles.app}>
      <div className={styles.map}>
        <BikeMap
          stations={stations}
          clusters={clusters}
          view={view}
          layer={layer}
          showMarkers={showMarkers}
          selectedId={selectedId}
          selectedClusterId={selectedClusterId}
          flyTarget={flyTarget}
          onSelect={setSelectedId}
          onSelectCluster={setSelectedClusterId}
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
          <ViewToggle view={view} onChange={setView} />
          <LayerToggle layer={layer} onChange={setLayer} />
          <StationSearch
            stations={stations}
            onSelect={(id) => {
              setView('stations');
              setSelectedId(id);
              const station = stations.find((item) => item.id === id);
              if (station) flyTo(station.lat, station.lon, 15);
            }}
          />
          <Summary stations={stations} />
          <Legend view={view} />
          {view === 'stations' && (
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={showMarkers}
              onClick={() => setShowMarkers((value) => !value)}
            >
              {showMarkers ? 'Hide markers' : 'Show markers'}
            </button>
          )}
          {view === 'clusters' && (
            <ClusterList
              clusters={clusters}
              layer={layer}
              selectedId={selectedClusterId}
              onSelect={(id) => {
                setSelectedClusterId(id);
                const cluster = clusters.find((item) => item.id === id);
                if (cluster) flyTo(cluster.lat, cluster.lon, 13);
              }}
            />
          )}
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
              cluster={selectedStationCluster}
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

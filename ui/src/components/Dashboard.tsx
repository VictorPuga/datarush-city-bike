'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { aggregateRegions, regionIdOf } from '@/lib/regions';
import { useJson } from '@/lib/useJson';
import type { Layer, PredictionsResponse, StationDayResponse } from '@/lib/types';
import type { FlyTarget } from './Map';
import Controls from './Controls';
import styles from './Dashboard.module.css';
import Legend from './Legend';
import RegionList from './RegionList';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const predictions = useJson<PredictionsResponse>(`/api/predictions?date=${date}&hour=${hour}`);
  const day = useJson<StationDayResponse>(
    selectedId ? `/api/predictions/day?date=${date}&station=${encodeURIComponent(selectedId)}` : null,
  );

  const stations = useMemo(() => predictions.data?.stations ?? [], [predictions.data]);
  const regions = useMemo(() => aggregateRegions(stations), [stations]);
  const selected = stations.find((station) => station.id === selectedId);
  const selectedStationRegion = regions.find((region) => region.id === (selected && regionIdOf(selected.id)));

  const flyTo = (lat: number, lon: number, zoom: number) =>
    setFlyTarget((previous) => ({ lat, lon, zoom, request: (previous?.request ?? 0) + 1 }));

  return (
    <main className={styles.app}>
      <div className={styles.map}>
        <BikeMap
          stations={stations}
          regions={regions}
          layer={layer}
          selectedId={selectedId}
          selectedRegionId={selectedRegionId}
          flyTarget={flyTarget}
          onSelect={setSelectedId}
          onSelectRegion={setSelectedRegionId}
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
              const station = stations.find((item) => item.id === id);
              if (station) flyTo(station.lat, station.lon, 16);
            }}
          />
          <Summary stations={stations} />
          <Legend />
          <RegionList
            regions={regions}
            layer={layer}
            selectedId={selectedRegionId}
            onSelect={(id) => {
              setSelectedRegionId(id);
              const region = regions.find((item) => item.id === id);
              if (region) flyTo(region.lat, region.lon, 14);
            }}
          />
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
              region={selectedStationRegion}
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

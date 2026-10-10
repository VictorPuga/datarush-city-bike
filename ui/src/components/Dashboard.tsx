'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { maxFor, viewMetric } from '@/lib/density';
import { regionIdOf } from '@/lib/regions';
import { useJson } from '@/lib/useJson';
import type { Layer, Metric, PredictionsResponse, StationDayResponse, WeatherResponse } from '@/lib/types';
import type { FlyTarget } from './Map';
import Controls from './Controls';
import Insights from './Insights';
import styles from './Dashboard.module.css';
import Legend from './Legend';
import RegionList from './RegionList';
import LayerToggle from './LayerToggle';
import MetricToggle from './MetricToggle';
import SheetHandle, { type SheetState } from './SheetHandle';
import StationPanel from './StationPanel';
import StationSearch from './StationSearch';
import Summary from './Summary';
import ThemeToggle from './ThemeToggle';
import Weather from './Weather';

const BikeMap = dynamic(() => import('./Map'), { ssr: false });

function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function Dashboard() {
  const [date, setDate] = useState(todayISO);
  const [slot, setSlot] = useState(32);
  const [metric, setMetric] = useState<Metric>('stock');
  const [layer, setLayer] = useState<Layer>('both');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [sheet, setSheet] = useState<SheetState>('half');
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const predictions = useJson<PredictionsResponse>(`/api/predictions?date=${date}&slot=${slot}`);
  const weather = useJson<WeatherResponse>(`/api/weather?date=${date}`);
  const day = useJson<StationDayResponse>(
    selectedId ? `/api/predictions/day?date=${date}&station=${encodeURIComponent(selectedId)}` : null,
  );

  const stations = useMemo(
    () => (predictions.data?.stations ?? []).map((station) => viewMetric(station, metric)),
    [predictions.data, metric],
  );
  const regions = useMemo(
    () => (predictions.data?.regions ?? []).map((region) => viewMetric(region, metric)),
    [predictions.data, metric],
  );
  const stationIds = useMemo(() => new Set(stations.map((station) => station.id)), [stations]);
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
          max={maxFor(metric)}
          selectedId={selectedId}
          selectedRegionId={selectedRegionId}
          flyTarget={flyTarget}
          onSelect={setSelectedId}
          onSelectRegion={setSelectedRegionId}
        />
        <div className={styles.theme}>
          <ThemeToggle />
        </div>
        {predictions.loading && (
          <div className={styles.loading} role="status">
            Loading predictions…
          </div>
        )}
      </div>
      <aside
        className={`${styles.sidebar} ${styles[sheet]} ${dragHeight === null ? '' : styles.dragging}`}
        style={dragHeight === null ? undefined : { height: dragHeight }}
      >
        <SheetHandle onChange={setSheet} onDrag={setDragHeight} />
        <div className={styles.content}>
          <h1>NYC bike availability forecast</h1>
          <Controls date={date} slot={slot} onDateChange={setDate} onSlotChange={setSlot} />
          <MetricToggle metric={metric} onChange={setMetric} />
          <LayerToggle layer={layer} onChange={setLayer} />
          {predictions.data?.weather === 'default' && (
            <p className={styles.notice}>Weather unavailable, using typical conditions.</p>
          )}
          <StationSearch
            stations={stations}
            onSelect={(id) => {
              setSelectedId(id);
              const station = stations.find((item) => item.id === id);
              if (station) flyTo(station.lat, station.lon, 16);
            }}
          />
          <Weather data={weather.data} slot={slot} />
          <Summary stations={stations} />
          <Legend metric={metric} />
          <Insights
            date={date}
            slot={slot}
            layer={layer}
            metric={metric}
            regions={regions}
            selectedId={selectedId}
            stationIds={stationIds}
            onSelectSlot={(nextDate, nextSlot) => {
              setDate(nextDate);
              setSlot(nextSlot);
            }}
            onSlotChange={setSlot}
            onSelectRegion={(id) => {
              setSelectedRegionId(id);
              const region = regions.find((item) => item.id === id);
              if (region) flyTo(region.lat, region.lon, 14);
            }}
          />
          <RegionList
            regions={regions}
            layer={layer}
            metric={metric}
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
              slot={slot}
              metric={metric}
              day={day.data}
              loading={day.loading}
              error={day.error}
              onSlotChange={setSlot}
              onClose={() => setSelectedId(null)}
              onRetry={day.retry}
            />
          )}
        </div>
      </aside>
    </main>
  );
}

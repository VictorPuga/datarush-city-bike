'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { colorFor, layerValue } from '@/lib/density';
import { regionShapes } from '@/lib/regions';
import type { Layer, RegionPrediction, StationPrediction } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import styles from './Map.module.css';

const NYC_CENTER: [number, number] = [40.7306, -73.9866];
const INITIAL_ZOOM = 13;
const STATION_MIN_ZOOM = 16;
const STATION_MARKER_RADIUS = 6;

export type FlyTarget = { lat: number; lon: number; zoom: number; request: number };

type MapProps = {
  stations: StationPrediction[];
  regions: RegionPrediction[];
  layer: Layer;
  selectedId: string | null;
  selectedRegionId: string | null;
  flyTarget: FlyTarget | null;
  onSelect: (id: string) => void;
  onSelectRegion: (id: string) => void;
};

function StationTooltip({ station }: { station: StationPrediction }) {
  return (
    <Tooltip sticky>
      <strong>{station.name}</strong>
      <br />
      <ClassicBikeIcon size={14} /> Classic: {station.classic} ({station.classicLow}–{station.classicHigh})
      <br />
      <ElectricBikeIcon size={14} /> Electric: {station.electric} ({station.electricLow}–{station.electricHigh})
    </Tooltip>
  );
}

function RegionTooltip({ region }: { region: RegionPrediction }) {
  return (
    <Tooltip sticky>
      <strong>{region.name}</strong> · {region.borough}
      <br />
      {region.id}
      <br />
      {region.stations} stations
      {region.stations > 0 && (
        <>
          <br />
          <ClassicBikeIcon size={14} /> Classic: {region.classic} ({region.classicLow}–{region.classicHigh})
          <br />
          <ElectricBikeIcon size={14} /> Electric: {region.electric} ({region.electricLow}–{region.electricHigh})
        </>
      )}
    </Tooltip>
  );
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  useMapEvents({ zoomend: (event) => onZoom(event.target.getZoom()) });
  return null;
}

function FlyToTarget({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), target.zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only on a new request, not on data refresh
  }, [target?.request, map]);
  return null;
}

export default function BikeMap({
  stations,
  regions,
  layer,
  selectedId,
  selectedRegionId,
  flyTarget,
  onSelect,
  onSelectRegion,
}: MapProps) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const showStations = zoom >= STATION_MIN_ZOOM;
  const regionById = new Map(regions.map((region) => [region.id, region]));

  return (
    <MapContainer center={NYC_CENTER} zoom={INITIAL_ZOOM} preferCanvas className={styles.map}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomWatcher onZoom={setZoom} />
      <FlyToTarget target={flyTarget} />
      {regionShapes.map((shape) => {
        const region = regionById.get(shape.id);
        if (!region) return null;
        const occupied = region.stations > 0;
        const isSelected = shape.id === selectedRegionId;
        const fillOpacity = showStations ? 0 : occupied ? 0.55 : 0.12;
        return (
          <Polygon
            key={`region-${shape.id}`}
            positions={shape.positions}
            pathOptions={{
              color: isSelected ? '#111' : '#555',
              weight: isSelected ? 3 : 1,
              fillColor: occupied ? colorFor(layerValue(region, layer) / region.stations) : '#9ca3af',
              fillOpacity,
            }}
            eventHandlers={{ click: () => onSelectRegion(shape.id) }}
          >
            <RegionTooltip region={region} />
          </Polygon>
        );
      })}
      {showStations &&
        stations.map((station) => (
          <CircleMarker
            key={`station-${station.id}`}
            center={[station.lat, station.lon]}
            radius={STATION_MARKER_RADIUS}
            pathOptions={{
              color: '#111',
              weight: station.id === selectedId ? 3 : 1,
              fillColor: colorFor(layerValue(station, layer)),
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelect(station.id) }}
          >
            <StationTooltip station={station} />
          </CircleMarker>
        ))}
    </MapContainer>
  );
}

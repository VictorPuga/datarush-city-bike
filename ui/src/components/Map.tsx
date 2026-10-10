'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Circle, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { colorFor, layerValue, radiusFor } from '@/lib/density';
import { regionShapes } from '@/lib/regions';
import type { RegionPrediction, Layer, StationPrediction, View } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import styles from './Map.module.css';

const NYC_CENTER: [number, number] = [40.7306, -73.9866];

function createStationIcon(electric: boolean) {
  const Icon = electric ? ElectricBikeIcon : ClassicBikeIcon;
  return L.divIcon({
    className: styles.stationIcon,
    html: renderToStaticMarkup(<Icon size={20} />),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [16, 0],
  });
}

let icons: { classic: L.DivIcon; electric: L.DivIcon } | null = null;

function stationIcon(station: StationPrediction, layer: Layer) {
  icons ??= { classic: createStationIcon(false), electric: createStationIcon(true) };
  const electric = layer === 'both' ? station.electric >= station.classic : layer === 'electric';
  return electric ? icons.electric : icons.classic;
}

export type FlyTarget = { lat: number; lon: number; zoom: number; request: number };

type MapProps = {
  stations: StationPrediction[];
  regions: RegionPrediction[];
  view: View;
  layer: Layer;
  showMarkers: boolean;
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
  view,
  layer,
  showMarkers,
  selectedId,
  selectedRegionId,
  flyTarget,
  onSelect,
  onSelectRegion,
}: MapProps) {
  const selected = stations.find((station) => station.id === selectedId);
  const regionById = new Map(regions.map((region) => [region.id, region]));

  return (
    <MapContainer center={NYC_CENTER} zoom={13} preferCanvas className={styles.map}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToTarget target={flyTarget} />
      {view === 'stations' &&
        stations.map((station) => {
          const value = layerValue(station, layer);
          return (
            <Circle
              key={`density-${station.id}`}
              center={[station.lat, station.lon]}
              radius={radiusFor(value)}
              pathOptions={{ stroke: false, fillColor: colorFor(value), fillOpacity: 0.45 }}
              eventHandlers={{ click: () => onSelect(station.id) }}
            >
              {!showMarkers && <StationTooltip station={station} />}
            </Circle>
          );
        })}
      {view === 'stations' && selected && (
        <Circle
          center={[selected.lat, selected.lon]}
          radius={radiusFor(layerValue(selected, layer)) + 10}
          pathOptions={{ color: '#111', weight: 3, fill: false }}
          interactive={false}
        />
      )}
      {view === 'stations' &&
        showMarkers &&
        stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lon]}
            icon={stationIcon(station, layer)}
            eventHandlers={{ click: () => onSelect(station.id) }}
          >
            <StationTooltip station={station} />
          </Marker>
        ))}
      {view === 'regions' &&
        regionShapes.map((shape) => {
          const region = regionById.get(shape.id);
          if (!region) return null;
          const occupied = region.stations > 0;
          const selected = shape.id === selectedRegionId;
          return (
            <Polygon
              key={`region-${shape.id}`}
              positions={shape.positions}
              pathOptions={{
                color: selected ? '#111' : '#555',
                weight: selected ? 3 : 1,
                fillColor: occupied ? colorFor(layerValue(region, layer) / region.stations) : '#9ca3af',
                fillOpacity: occupied ? 0.55 : 0.12,
              }}
              eventHandlers={{ click: () => onSelectRegion(shape.id) }}
            >
              <RegionTooltip region={region} />
            </Polygon>
          );
        })}
    </MapContainer>
  );
}

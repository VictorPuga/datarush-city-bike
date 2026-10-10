'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { colorFor, layerValue, radiusFor } from '@/lib/density';
import type { Layer, StationPrediction } from '@/lib/types';
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

type MapProps = {
  stations: StationPrediction[];
  layer: Layer;
  showMarkers: boolean;
  selectedId: string | null;
  flyTarget: { id: string; request: number } | null;
  onSelect: (id: string) => void;
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

function FlyToStation({ stations, target }: { stations: StationPrediction[]; target: MapProps['flyTarget'] }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const station = stations.find((item) => item.id === target.id);
    if (station) map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only on a new request, not on data refresh
  }, [target?.request, map]);
  return null;
}

export default function BikeMap({ stations, layer, showMarkers, selectedId, flyTarget, onSelect }: MapProps) {
  const selected = stations.find((station) => station.id === selectedId);

  return (
    <MapContainer center={NYC_CENTER} zoom={13} preferCanvas className={styles.map}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToStation stations={stations} target={flyTarget} />
      {stations.map((station) => {
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
      {selected && (
        <Circle
          center={[selected.lat, selected.lon]}
          radius={radiusFor(layerValue(selected, layer)) + 10}
          pathOptions={{ color: '#111', weight: 3, fill: false }}
          interactive={false}
        />
      )}
      {showMarkers && (
        <MarkerClusterGroup chunkedLoading>
          {stations.map((station) => (
            <Marker
              key={station.id}
              position={[station.lat, station.lon]}
              icon={stationIcon(station, layer)}
              eventHandlers={{ click: () => onSelect(station.id) }}
            >
              <StationTooltip station={station} />
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}
    </MapContainer>
  );
}

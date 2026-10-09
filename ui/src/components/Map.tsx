'use client';

import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import 'leaflet/dist/leaflet.css';
import { Circle, MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import type { StationPrediction } from '@/lib/types';
import { ClassicBikeIcon, ElectricBikeIcon } from './BikeIcons';
import styles from './Map.module.css';

const NYC_CENTER: [number, number] = [40.7306, -73.9866];

function stationIcon(station: StationPrediction) {
  const electricDominant = station.electric >= station.classic;
  const Icon = electricDominant ? ElectricBikeIcon : ClassicBikeIcon;
  return L.divIcon({
    className: styles.stationIcon,
    html: renderToStaticMarkup(<Icon size={20} />),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [16, 0],
  });
}

const BASE_RADIUS_METERS = 40;
const RADIUS_PER_SQRT_BIKE = 25;

type MapProps = {
  stations: StationPrediction[];
  showMarkers: boolean;
};

function StationTooltip({ station }: { station: StationPrediction }) {
  return (
    <Tooltip sticky>
      <strong>{station.name}</strong>
      <br />
      <ClassicBikeIcon size={14} /> Classic: {station.classic}
      <br />
      <ElectricBikeIcon size={14} /> Electric: {station.electric}
    </Tooltip>
  );
}

export default function BikeMap({ stations, showMarkers }: MapProps) {
  return (
    <MapContainer center={NYC_CENTER} zoom={13} className={styles.map}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stations.map((station) => (
        <Circle
          key={`density-${station.id}`}
          center={[station.lat, station.lon]}
          radius={BASE_RADIUS_METERS + RADIUS_PER_SQRT_BIKE * Math.sqrt(station.classic + station.electric)}
          pathOptions={{ stroke: false, fillColor: '#e4572e', fillOpacity: 0.3 }}
        >
          {!showMarkers && <StationTooltip station={station} />}
        </Circle>
      ))}
      {showMarkers &&
        stations.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lon]} icon={stationIcon(station)}>
            <StationTooltip station={station} />
          </Marker>
        ))}
    </MapContainer>
  );
}

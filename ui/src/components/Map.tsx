'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet';
import type { StationPrediction } from '@/lib/types';
import styles from './Map.module.css';

const NYC_CENTER: [number, number] = [40.7306, -73.9866];

const defaultIcon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  tooltipAnchor: [16, -28],
});

type MapProps = {
  stations: StationPrediction[];
};

export default function BikeMap({ stations }: MapProps) {
  return (
    <MapContainer center={NYC_CENTER} zoom={13} className={styles.map}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stations.map((station) => (
        <Marker key={station.id} position={[station.lat, station.lon]} icon={defaultIcon}>
          <Tooltip>
            <strong>{station.name}</strong>
            <br />
            Classic: {station.classic}
            <br />
            Electric: {station.electric}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

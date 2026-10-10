'use client';

import { useMemo, useState } from 'react';
import type { StationPrediction } from '@/lib/types';
import styles from './StationSearch.module.css';

type StationSearchProps = {
  stations: StationPrediction[];
  onSelect: (id: string) => void;
};

const MAX_RESULTS = 8;

export default function StationSearch({ stations, onSelect }: StationSearchProps) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return stations.filter((station) => station.name.toLowerCase().includes(needle)).slice(0, MAX_RESULTS);
  }, [stations, query]);

  const select = (id: string) => {
    onSelect(id);
    setQuery('');
  };

  return (
    <div className={styles.search}>
      <label className={styles.label}>
        <span>Search station</span>
        <input
          type="search"
          value={query}
          placeholder="e.g. Broadway & W 25 St"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) select(results[0].id);
          }}
        />
      </label>
      {query.trim() !== '' && (
        <ul className={styles.results}>
          {results.length === 0 && <li className={styles.empty}>No stations found</li>}
          {results.map((station) => (
            <li key={station.id}>
              <button type="button" onClick={() => select(station.id)}>
                {station.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

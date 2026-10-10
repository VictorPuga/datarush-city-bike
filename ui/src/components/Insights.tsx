import { useState } from 'react';
import { useJson } from '@/lib/useJson';
import type { InsightsResponse, Layer, Metric, RegionPrediction } from '@/lib/types';
import DayChart from './DayChart';
import DemandHistogram from './DemandHistogram';
import styles from './Insights.module.css';
import NetFlowChart from './NetFlowChart';
import RegionRanking from './RegionRanking';
import WeekHeatmap from './WeekHeatmap';

type InsightsProps = {
  date: string;
  slot: number;
  layer: Layer;
  metric: Metric;
  regions: RegionPrediction[];
  selectedId: string | null;
  stationIds: Set<string>;
  onSelectSlot: (date: string, slot: number) => void;
  onSlotChange: (slot: number) => void;
  onSelectRegion: (id: string) => void;
};

const TABS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'ranking', label: 'Top/Bottom' },
  { id: 'flow', label: 'Net flow' },
  { id: 'demand', label: 'Demand' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Insights({
  date,
  slot,
  layer,
  metric,
  regions,
  selectedId,
  stationIds,
  onSelectSlot,
  onSlotChange,
  onSelectRegion,
}: InsightsProps) {
  const [tab, setTab] = useState<TabId>('day');
  const insights = useJson<InsightsResponse>(`/api/insights?date=${date}&slot=${slot}`);
  const data = insights.data;
  const today = data?.week.find((day) => day.date === date);

  return (
    <section aria-label="Insights">
      <h2 className={styles.title}>Insights</h2>
      <div className={styles.tabs} role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'ranking' && <RegionRanking regions={regions} layer={layer} metric={metric} onSelect={onSelectRegion} />}
      {tab === 'demand' && <DemandHistogram selectedId={selectedId} stationIds={stationIds} />}
      {tab === 'day' && today && <DayChart slots={today.slots} slot={slot} metric={metric} onSlotChange={onSlotChange} />}
      {tab === 'week' && data && (
        <WeekHeatmap
          week={data.week}
          layer={layer}
          metric={metric}
          date={date}
          slot={slot}
          onSelect={onSelectSlot}
        />
      )}
      {tab === 'flow' && data && (
        <NetFlowChart flows={data.netFlow} regions={regions} layer={layer} slot={slot} onSelect={onSelectRegion} />
      )}
      {insights.loading && !data && <p className={styles.note}>Loading insights…</p>}
      {insights.error && (
        <p role="alert" className={styles.note}>
          {insights.error}{' '}
          <button type="button" onClick={insights.retry}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}

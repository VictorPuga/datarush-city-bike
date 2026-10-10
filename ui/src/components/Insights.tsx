import { useState } from 'react';
import { useJson } from '@/lib/useJson';
import type { InsightsResponse, Layer, RegionPrediction } from '@/lib/types';
import DayChart from './DayChart';
import DemandHistogram from './DemandHistogram';
import styles from './Insights.module.css';
import NetFlowChart from './NetFlowChart';
import RegionRanking from './RegionRanking';
import WeekHeatmap from './WeekHeatmap';

type InsightsProps = {
  date: string;
  hour: number;
  layer: Layer;
  regions: RegionPrediction[];
  selectedId: string | null;
  onSelectSlot: (date: string, hour: number) => void;
  onHourChange: (hour: number) => void;
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
  hour,
  layer,
  regions,
  selectedId,
  onSelectSlot,
  onHourChange,
  onSelectRegion,
}: InsightsProps) {
  const [tab, setTab] = useState<TabId>('day');
  const insights = useJson<InsightsResponse>(`/api/insights?date=${date}&hour=${hour}`);
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
      {tab === 'ranking' && <RegionRanking regions={regions} layer={layer} onSelect={onSelectRegion} />}
      {tab === 'demand' && <DemandHistogram selectedId={selectedId} />}
      {tab === 'day' && today && <DayChart hours={today.hours} hour={hour} onHourChange={onHourChange} />}
      {tab === 'week' && data && (
        <WeekHeatmap week={data.week} layer={layer} date={date} hour={hour} onSelect={onSelectSlot} />
      )}
      {tab === 'flow' && data && (
        <NetFlowChart flows={data.netFlow} regions={regions} layer={layer} hour={hour} onSelect={onSelectRegion} />
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

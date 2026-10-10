import { ResponsiveHeatMap } from '@nivo/heatmap';
import { colorFor, layerValue, maxFor, viewCitySlot } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import type { DayTotals, Layer, Metric } from '@/lib/types';
import styles from './Insights.module.css';

type WeekHeatmapProps = {
  week: DayTotals[];
  layer: Layer;
  metric: Metric;
  date: string;
  slot: number;
  onSelect: (date: string, slot: number) => void;
};

function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export default function WeekHeatmap({ week, layer, metric, date, slot, onSelect }: WeekHeatmapProps) {
  const data = week.map((day) => ({
    id: day.date,
    data: day.slots.map((item, x) => ({ x, y: layerValue(viewCitySlot(item, metric), layer) })),
  }));
  const max = Math.max(1, ...data.flatMap((row) => row.data.map((cell) => cell.y)));

  return (
    <div className={styles.chart} role="img" aria-label="Predicted bikes by day of week and hour">
      <ResponsiveHeatMap
        data={data}
        theme={nivoTheme}
        margin={{ top: 24, right: 8, bottom: 8, left: 40 }}
        colors={(cell) => colorFor(((cell.value ?? 0) / max) * maxFor(metric))}
        enableLabels={false}
        axisTop={{
          tickValues: [0, 24, 48, 72, 95],
          format: (value) => String(Math.floor(Number(value) / 4)).padStart(2, '0'),
        }}
        axisLeft={{ format: (value) => weekday(String(value)), tickSize: 0 }}
        xInnerPadding={0}
        yInnerPadding={0.1}
        borderWidth={1}
        borderColor={(cell) =>
          cell.serieId === date && cell.data.x === slot ? 'currentColor' : 'transparent'
        }
        valueFormat=">-,.0f"
        onClick={(cell) => onSelect(String(cell.serieId), Number(cell.data.x))}
      />
    </div>
  );
}

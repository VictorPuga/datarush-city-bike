import { ResponsiveHeatMap } from '@nivo/heatmap';
import { colorFor, layerValue, MAX_BIKES } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import type { DayTotals, Layer } from '@/lib/types';
import styles from './Insights.module.css';

type WeekHeatmapProps = {
  week: DayTotals[];
  layer: Layer;
  date: string;
  hour: number;
  onSelect: (date: string, hour: number) => void;
};

function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export default function WeekHeatmap({ week, layer, date, hour, onSelect }: WeekHeatmapProps) {
  const data = week.map((day) => ({
    id: day.date,
    data: day.hours.map((item, x) => ({ x, y: layerValue(item, layer) })),
  }));
  const max = Math.max(1, ...data.flatMap((row) => row.data.map((cell) => cell.y)));

  return (
    <div className={styles.chart} role="img" aria-label="Predicted bikes by day of week and hour">
      <ResponsiveHeatMap
        data={data}
        theme={nivoTheme}
        margin={{ top: 24, right: 8, bottom: 8, left: 40 }}
        colors={(cell) => colorFor(((cell.value ?? 0) / max) * MAX_BIKES)}
        enableLabels={false}
        axisTop={{ tickValues: [0, 6, 12, 18, 23] }}
        axisLeft={{ format: (value) => weekday(String(value)), tickSize: 0 }}
        xInnerPadding={0.05}
        yInnerPadding={0.1}
        borderWidth={1}
        borderColor={(cell) =>
          cell.serieId === date && cell.data.x === hour ? 'currentColor' : 'transparent'
        }
        valueFormat=">-,.0f"
        onClick={(cell) => onSelect(String(cell.serieId), Number(cell.data.x))}
      />
    </div>
  );
}

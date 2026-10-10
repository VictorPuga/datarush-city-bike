import { ResponsiveLine, type LineCustomSvgLayer } from '@nivo/line';
import { CLASSIC_COLOR, ELECTRIC_COLOR, viewMetric } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import { SLOTS_PER_DAY, SLOTS_PER_HOUR } from '@/lib/time';
import type { Metric, SlotPrediction } from '@/lib/types';
import styles from './StationChart.module.css';

type StationChartProps = {
  slots: SlotPrediction[];
  slot: number;
  metric: Metric;
  onSlotChange: (slot: number) => void;
};

type Series = {
  id: string;
  color: string;
  value: (item: SlotPrediction) => number;
  low: (item: SlotPrediction) => number;
  high: (item: SlotPrediction) => number;
};

const SERIES: Series[] = [
  {
    id: 'Classic',
    color: CLASSIC_COLOR,
    value: (item) => item.classic,
    low: (item) => item.classicLow,
    high: (item) => item.classicHigh,
  },
  {
    id: 'Electric',
    color: ELECTRIC_COLOR,
    value: (item) => item.electric,
    low: (item) => item.electricLow,
    high: (item) => item.electricHigh,
  },
];

export default function StationChart({ slots, slot, metric, onSlotChange }: StationChartProps) {
  const hours = slots.map((item) => viewMetric(item, metric));
  const yMax = Math.max(1, ...hours.map((item) => Math.max(item.classicHigh, item.electricHigh)));
  const data = SERIES.map((series) => ({
    id: series.id,
    color: series.color,
    data: hours.map((item) => ({ x: item.slot, y: series.value(item) })),
  }));

  const bands: LineCustomSvgLayer<(typeof data)[number]> = ({ xScale, yScale }) => (
    <g>
      {SERIES.map((series) => {
        const upper = hours.map((item) => `${xScale(item.slot)} ${yScale(series.high(item))}`);
        const lower = [...hours].reverse().map((item) => `${xScale(item.slot)} ${yScale(series.low(item))}`);
        return (
          <path key={series.id} d={`M${upper.join(' L')} L${lower.join(' L')} Z`} fill={series.color} opacity={0.2} />
        );
      })}
    </g>
  );

  return (
    <div>
      <div className={styles.plot} role="img" aria-label="Predicted bikes over the day with confidence range">
        <ResponsiveLine
          data={data}
          theme={nivoTheme}
          colors={(serie) => serie.color}
          margin={{ top: 8, right: 8, bottom: 28, left: 32 }}
          xScale={{ type: 'linear', min: 0, max: SLOTS_PER_DAY - 1 }}
          yScale={{ type: 'linear', min: 0, max: yMax }}
          axisBottom={{
            tickValues: [0, 24, 48, 72, 95],
            format: (value) => String(Math.floor(Number(value) / SLOTS_PER_HOUR)).padStart(2, '0'),
          }}
          axisLeft={{ tickValues: [0, yMax] }}
          enableGridX={false}
          enableGridY={false}
          enablePoints={false}
          useMesh
          onClick={(point) => 'data' in point && onSlotChange(Number(point.data.x))}
          layers={['grid', 'axes', bands, 'lines', 'markers', 'mesh']}
          markers={[{ axis: 'x', value: slot, lineStyle: { stroke: 'currentColor', strokeDasharray: '3 3' } }]}
        />
      </div>
      <div className={styles.legend}>
        {SERIES.map((series) => (
          <span key={series.id}>
            <i style={{ background: series.color }} /> {series.id}
          </span>
        ))}
        <span>Shaded: confidence range</span>
      </div>
    </div>
  );
}

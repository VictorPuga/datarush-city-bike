import { CLASSIC_COLOR, ELECTRIC_COLOR } from '@/lib/density';
import type { HourPrediction } from '@/lib/types';
import styles from './StationChart.module.css';

type StationChartProps = {
  hours: HourPrediction[];
  hour: number;
  onHourChange: (hour: number) => void;
};

const WIDTH = 320;
const HEIGHT = 160;
const PAD = { top: 8, right: 8, bottom: 22, left: 28 };
const X_TICKS = [0, 6, 12, 18, 23];

type Series = {
  label: string;
  color: string;
  value: (item: HourPrediction) => number;
  low: (item: HourPrediction) => number;
  high: (item: HourPrediction) => number;
};

const SERIES: Series[] = [
  {
    label: 'Classic',
    color: CLASSIC_COLOR,
    value: (item) => item.classic,
    low: (item) => item.classicLow,
    high: (item) => item.classicHigh,
  },
  {
    label: 'Electric',
    color: ELECTRIC_COLOR,
    value: (item) => item.electric,
    low: (item) => item.electricLow,
    high: (item) => item.electricHigh,
  },
];

export default function StationChart({ hours, hour, onHourChange }: StationChartProps) {
  const yMax = Math.max(1, ...hours.map((item) => Math.max(item.classicHigh, item.electricHigh)));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (h: number) => PAD.left + (h / 23) * plotWidth;
  const y = (v: number) => PAD.top + plotHeight - (v / yMax) * plotHeight;
  const line = (fn: (item: HourPrediction) => number) =>
    hours.map((item, i) => `${i === 0 ? 'M' : 'L'}${x(item.hour)} ${y(fn(item))}`).join(' ');
  const band = (series: Series) => {
    const upper = hours.map((item) => `${x(item.hour)} ${y(series.high(item))}`);
    const lower = [...hours].reverse().map((item) => `${x(item.hour)} ${y(series.low(item))}`);
    return `M${upper.join(' L')} L${lower.join(' L')} Z`;
  };

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const next = Math.round(((svgX - PAD.left) / plotWidth) * 23);
    onHourChange(Math.min(23, Math.max(0, next)));
  };

  return (
    <div className={styles.chart}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Predicted bikes over 24 hours with confidence range"
        onPointerDown={handlePointer}
      >
        {[0, yMax].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className={styles.grid} />
            <text x={PAD.left - 4} y={y(tick) + 3} textAnchor="end" className={styles.tick}>
              {tick}
            </text>
          </g>
        ))}
        {X_TICKS.map((tick) => (
          <text key={tick} x={x(tick)} y={HEIGHT - 6} textAnchor="middle" className={styles.tick}>
            {String(tick).padStart(2, '0')}
          </text>
        ))}
        {SERIES.map((series) => (
          <g key={series.label}>
            <path d={band(series)} fill={series.color} opacity="0.2" />
            <path d={line(series.value)} fill="none" stroke={series.color} strokeWidth="2" />
          </g>
        ))}
        <line x1={x(hour)} x2={x(hour)} y1={PAD.top} y2={PAD.top + plotHeight} className={styles.cursor} />
      </svg>
      <div className={styles.legend}>
        {SERIES.map((series) => (
          <span key={series.label}>
            <i style={{ background: series.color }} /> {series.label}
          </span>
        ))}
        <span>Shaded: confidence range</span>
      </div>
    </div>
  );
}

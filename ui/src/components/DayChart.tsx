import { ResponsiveLine } from '@nivo/line';
import { CLASSIC_COLOR, ELECTRIC_COLOR, viewCitySlot } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import { SLOTS_PER_DAY } from '@/lib/time';
import type { CitySlot, Metric } from '@/lib/types';
import styles from './Insights.module.css';

type DayChartProps = {
  slots: CitySlot[];
  slot: number;
  metric: Metric;
  onSlotChange: (slot: number) => void;
};

export default function DayChart({ slots, slot, metric, onSlotChange }: DayChartProps) {
  const views = slots.map((item) => viewCitySlot(item, metric));
  const data = [
    { id: 'Classic', color: CLASSIC_COLOR, data: views.map((item, x) => ({ x, y: item.classic })) },
    { id: 'Electric', color: ELECTRIC_COLOR, data: views.map((item, x) => ({ x, y: item.electric })) },
  ];

  return (
    <div className={styles.chart} role="img" aria-label="Citywide predicted bikes over the day">
      <ResponsiveLine
        data={data}
        theme={nivoTheme}
        colors={(serie) => serie.color}
        margin={{ top: 12, right: 12, bottom: 32, left: 48 }}
        xScale={{ type: 'linear', min: 0, max: SLOTS_PER_DAY - 1 }}
        yScale={{ type: 'linear', min: 0, max: 'auto' }}
        axisBottom={{
          tickValues: [0, 24, 48, 72, 95],
          format: (value) => String(Math.floor(Number(value) / 4)).padStart(2, '0'),
          legend: 'Hour',
          legendOffset: 28,
          legendPosition: 'middle',
        }}
        axisLeft={{ format: '>-.2s', tickValues: 5 }}
        enablePoints={false}
        enableGridX={false}
        curve="monotoneX"
        useMesh
        onClick={(point) => 'data' in point && onSlotChange(Number(point.data.x))}
        markers={[{ axis: 'x', value: slot, lineStyle: { stroke: 'currentColor', strokeDasharray: '3 3' } }]}
        legends={[
          {
            anchor: 'top-right',
            direction: 'row',
            translateY: -12,
            itemWidth: 70,
            itemHeight: 12,
            symbolSize: 10,
            itemTextColor: 'currentColor',
          },
        ]}
      />
    </div>
  );
}

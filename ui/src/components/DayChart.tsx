import { ResponsiveLine } from '@nivo/line';
import { CLASSIC_COLOR, ELECTRIC_COLOR } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import type { CityHour } from '@/lib/types';
import styles from './Insights.module.css';

type DayChartProps = {
  hours: CityHour[];
  hour: number;
  onHourChange: (hour: number) => void;
};

export default function DayChart({ hours, hour, onHourChange }: DayChartProps) {
  const data = [
    { id: 'Classic', color: CLASSIC_COLOR, data: hours.map((item, x) => ({ x, y: item.classic })) },
    { id: 'Electric', color: ELECTRIC_COLOR, data: hours.map((item, x) => ({ x, y: item.electric })) },
  ];

  return (
    <div className={styles.chart} role="img" aria-label="Citywide predicted bikes over the day">
      <ResponsiveLine
        data={data}
        theme={nivoTheme}
        colors={(serie) => serie.color}
        margin={{ top: 12, right: 12, bottom: 32, left: 48 }}
        xScale={{ type: 'linear', min: 0, max: 23 }}
        yScale={{ type: 'linear', min: 0, max: 'auto' }}
        axisBottom={{ tickValues: [0, 6, 12, 18, 23], legend: 'Hour', legendOffset: 28, legendPosition: 'middle' }}
        axisLeft={{ format: '>-.2s', tickValues: 5 }}
        enablePoints={false}
        enableGridX={false}
        curve="monotoneX"
        useMesh
        onClick={(point) => 'data' in point && onHourChange(Number(point.data.x))}
        markers={[{ axis: 'x', value: hour, lineStyle: { stroke: 'currentColor', strokeDasharray: '3 3' } }]}
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

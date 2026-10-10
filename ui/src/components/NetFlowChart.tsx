import { ResponsiveBar } from '@nivo/bar';
import { layerValue } from '@/lib/density';
import { GAIN_COLOR, LOSS_COLOR, nivoTheme } from '@/lib/nivoTheme';
import type { Layer, RegionFlow, RegionPrediction } from '@/lib/types';
import styles from './Insights.module.css';

type NetFlowChartProps = {
  flows: RegionFlow[];
  regions: RegionPrediction[];
  layer: Layer;
  hour: number;
  onSelect: (id: string) => void;
};

const COUNT = 5;

export default function NetFlowChart({ flows, regions, layer, hour, onSelect }: NetFlowChartProps) {
  const names = new Map(regions.map((region) => [region.id, region.name]));
  const sorted = flows
    .map((flow) => ({ id: flow.id, label: names.get(flow.id) ?? flow.id, value: layerValue(flow, layer) }))
    .sort((a, b) => b.value - a.value);
  const data = [...sorted.slice(0, COUNT), ...sorted.slice(-COUNT)].reverse();
  const limit = Math.max(1, ...data.map((item) => Math.abs(item.value)));

  return (
    <>
      <div className={styles.chart} role="img" aria-label="Net bike change per neighborhood">
        <ResponsiveBar
          data={data}
          keys={['value']}
          indexBy="label"
          layout="horizontal"
          theme={nivoTheme}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          padding={0.25}
          valueScale={{ type: 'linear', min: -limit, max: limit }}
          colors={(bar) => (Number(bar.data.value) >= 0 ? GAIN_COLOR : LOSS_COLOR)}
          axisLeft={null}
          axisBottom={null}
          enableGridY={false}
          enableLabel={false}
          layers={[
            'grid',
            'bars',
            ({ bars }) => (
              <g>
                {bars.map((bar) => {
                  const gain = Number(bar.data.value) >= 0;
                  return (
                    <text
                      key={bar.key}
                      x={gain ? bar.x - 6 : bar.x + bar.width + 6}
                      y={bar.y + bar.height / 2}
                      textAnchor={gain ? 'end' : 'start'}
                      dominantBaseline="central"
                      fill="currentColor"
                      fontSize={11}
                    >
                      {String(bar.data.indexValue).slice(0, 20)}
                    </text>
                  );
                })}
              </g>
            ),
          ]}
          onClick={(bar) => onSelect(bar.data.id)}
        />
      </div>
      <p className={styles.note}>
        Change in bikes from {String(hour).padStart(2, '0')}:00 to {String((hour + 1) % 24).padStart(2, '0')}:00.
        Blue gains bikes, orange loses them.
      </p>
    </>
  );
}

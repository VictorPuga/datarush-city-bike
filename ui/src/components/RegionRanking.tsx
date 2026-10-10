import { ResponsiveBar } from '@nivo/bar';
import { layerValue, RAMP } from '@/lib/density';
import { nivoTheme } from '@/lib/nivoTheme';
import type { Layer, Metric, RegionPrediction } from '@/lib/types';
import styles from './Insights.module.css';

type RegionRankingProps = {
  regions: RegionPrediction[];
  layer: Layer;
  metric: Metric;
  onSelect: (id: string) => void;
};

const COUNT = 5;

export default function RegionRanking({ regions, layer, metric, onSelect }: RegionRankingProps) {
  const ranked = regions
    .filter((region) => region.stations > 0)
    .map((region) => ({ id: region.id, label: region.name, value: layerValue(region, layer) }))
    .sort((a, b) => b.value - a.value);
  const top = ranked.slice(0, COUNT).map((item) => ({ ...item, group: 'top' }));
  const bottom = ranked.slice(-COUNT).map((item) => ({ ...item, group: 'bottom' }));
  const data = [...top, ...bottom].reverse();

  return (
    <div className={styles.chart} role="img" aria-label={`Neighborhoods with the most and fewest predicted ${metric === 'stock' ? 'bikes' : metric}`}>
      <ResponsiveBar
        data={data}
        keys={['value']}
        indexBy="label"
        layout="horizontal"
        theme={nivoTheme}
        margin={{ top: 8, right: 36, bottom: 8, left: 130 }}
        padding={0.25}
        colors={(bar) => (bar.data.group === 'top' ? RAMP[2] : RAMP[0])}
        axisLeft={{ tickSize: 0, format: (value) => String(value).slice(0, 20) }}
        axisBottom={null}
        enableGridY={false}
        labelTextColor="#171717"
        onClick={(bar) => onSelect(bar.data.id)}
      />
    </div>
  );
}

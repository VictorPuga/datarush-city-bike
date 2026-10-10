import type { ResponsiveBar } from '@nivo/bar';
import type { ComponentProps } from 'react';

type Theme = NonNullable<ComponentProps<typeof ResponsiveBar>['theme']>;

export const nivoTheme: Theme = {
  text: { fill: 'currentColor', fontSize: 11 },
  axis: {
    ticks: { text: { fill: 'currentColor', opacity: 0.8 } },
    legend: { text: { fill: 'currentColor' } },
  },
  grid: { line: { stroke: 'currentColor', strokeOpacity: 0.15 } },
  tooltip: {
    container: { background: 'var(--background)', color: 'var(--foreground)', fontSize: 12 },
  },
};

export const LOSS_COLOR = '#ff3b30';
export const GAIN_COLOR = '#007aff';

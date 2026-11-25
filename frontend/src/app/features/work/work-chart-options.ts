import type {ChartOptions} from 'chart.js';

// Canvas axes need resolved colors when the chart redraws after a theme change.
export function workBarChartOptions(dark: boolean, wholeNumbers = false): ChartOptions<'bar'> {
  const color = dark ? '#cbd5e1' : '#475569';
  const grid = dark ? '#475569' : '#e2e8f0';
  return {
    maintainAspectRatio: false,
    plugins: {legend: {display: false}},
    scales: {
      x: {ticks: {color}, grid: {display: false}, border: {color: grid}},
      y: {ticks: {color, ...(wholeNumbers ? {stepSize: 1} : {})}, grid: {color: grid}, border: {color: grid}},
    },
  };
}

import {onCLS, onFCP, onINP, onLCP, onTTFB, type Metric} from 'web-vitals';

export function reportWebVitals(path: string, compact: boolean): void {
  const surface = path.startsWith('/auth/') ? 'login' : path.startsWith('/work/') ? 'work'
    : path === '/solicitud' || path === '/seguimiento' ? 'public' : 'other';
  const screen = compact ? 'compact' : 'wide';
  const report = ({name, value}: Metric) => {
    void fetch('/api/telemetry/vitals', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'omit',
      keepalive: true, body: JSON.stringify({metric: name, value, surface, screen}),
    }).catch(() => undefined);
  };
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}

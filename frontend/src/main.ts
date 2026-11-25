import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import {environment} from './environments/environment';

bootstrapApplication(App, appConfig)
  .then(() => {
    if (!environment.production || ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true) || Math.random() >= .1) return;
    const path = location.pathname;
    const compact = matchMedia('(max-width: 767px)').matches;
    const start = () => void import('./app/core/telemetry/web-vitals').then(module => module.reportWebVitals(path, compact)).catch(() => undefined);
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, {timeout: 4000});
    else globalThis.setTimeout(start, 1500);
  })
  .catch((err) => console.error(err));

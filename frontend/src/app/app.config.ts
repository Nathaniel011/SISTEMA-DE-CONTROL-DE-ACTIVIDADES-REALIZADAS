import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {provideClientHydration, withNoHttpTransferCache} from '@angular/platform-browser';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import {providePrimeNG} from 'primeng/config';
import {definePreset} from '@primeuix/themes';
import lang from '../assets/lang.json';
import {authInterceptor} from './core/interceptors/auth.interceptor';
import {errorInterceptor} from './core/interceptors/error.interceptor';
import {inFlightInterceptor} from './core/interceptors/in-flight.interceptor';
import {ThemeService} from './core/services/theme.service';

const Preset = definePreset(Aura, {
  components: {
    card: {
      body: {
        padding: '0px'
      }
    }
  },
  primitive: {
    // Escala Teal — primario rgb(20, 184, 166) / #14b8a6
    work: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e'
    },
    // Superficies: neutros claros + teal oscuro en chrome (sidebar, fondos)
    track: {
      0: '#ffffff',
      50: '#f8fafc',
      100: '#f0fdfa',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e'
    }
  },
  semantic: {
    primary: {
      50: '{work.50}',
      100: '{work.100}',
      200: '{work.200}',
      300: '{work.300}',
      400: '{work.400}',
      500: '{work.500}',
      600: '{work.600}',
      700: '{work.700}',
      800: '{work.800}',
      900: '{work.900}',
      950: '{work.950}'
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          contrastColor: '{surface.0}',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}'
        },
        surface: {
          0: '{track.0}',
          50: '{track.50}',
          100: '{track.100}',
          200: '{track.200}',
          300: '{track.300}',
          400: '{track.400}',
          500: '{track.500}',
          600: '{track.600}',
          700: '{track.700}',
          800: '{track.800}',
          900: '{track.900}',
          950: '{track.950}'
        }
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f2f7f7',
          100: '#deeaeb',
          200: '#c9d9da',
          300: '#b3c9cb',
          400: '#9cb3b6',
          500: '#789397',
          600: '#526b70',
          700: '#384c51',
          800: '#26373c',
          900: '#1a292e',
          950: '#101b20'
        },
        text: { color: '{surface.100}' }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => { inject(ThemeService); }),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, inFlightInterceptor])),
    provideClientHydration(withNoHttpTransferCache()),
    provideRouter(routes),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: Preset,
        options: {
          darkModeSelector: '.scar-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng'
          }
        }
      },
      translation: lang.es
    })
  ]
};

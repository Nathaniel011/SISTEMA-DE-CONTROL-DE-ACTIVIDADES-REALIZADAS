import {DOCUMENT, isPlatformBrowser} from '@angular/common';
import {DestroyRef, Injectable, PLATFORM_ID, inject, signal} from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const storageKey = 'scar-theme';

function readPreference(view: Window): ThemePreference {
  try {
    const stored = view.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // The current tab still supports theme changes when storage is restricted.
  }
  return 'system';
}

@Injectable({providedIn: 'root'})
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly view = isPlatformBrowser(inject(PLATFORM_ID)) ? this.document.defaultView : null;
  private readonly media = this.view?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly selected = signal<ThemePreference>(this.view ? readPreference(this.view) : 'system');
  private readonly dark = signal(false);
  readonly preference = this.selected.asReadonly();
  readonly isDark = this.dark.asReadonly();

  constructor() {
    const view = this.view;
    if (!view) return;
    const update = () => this.apply();
    const syncTabs = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        this.selected.set(readPreference(view));
        this.apply();
      }
    };
    this.apply();
    this.media?.addEventListener('change', update);
    view.addEventListener('storage', syncTabs);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', update);
      view.removeEventListener('storage', syncTabs);
    });
  }

  setPreference(value: ThemePreference): void {
    this.selected.set(value);
    this.apply();
    try {
      if (value === 'system') this.view?.localStorage.removeItem(storageKey);
      else this.view?.localStorage.setItem(storageKey, value);
    } catch {
      // Keep the choice for this tab.
    }
  }

  private apply(): void {
    const preference = this.selected();
    const dark = preference === 'dark' || (preference === 'system' && !!this.media?.matches);
    this.document.documentElement.classList.toggle('scar-dark', dark);
    this.dark.set(dark);
  }
}

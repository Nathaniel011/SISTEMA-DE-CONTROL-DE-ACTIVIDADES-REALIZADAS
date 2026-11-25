import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ThemeService} from './theme.service';

let darkSystem: boolean;
let changes: EventTarget;

beforeEach(() => {
  darkSystem = false;
  changes = new EventTarget();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return darkSystem; },
    addEventListener: changes.addEventListener.bind(changes),
    removeEventListener: changes.removeEventListener.bind(changes),
  }));
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem('scar-theme');
  document.documentElement.classList.remove('scar-dark');
});

it('follows the system until the user chooses a fixed theme', () => {
  const theme = TestBed.inject(ThemeService);
  expect(theme.preference()).toBe('system');
  expect(theme.isDark()).toBe(false);
  darkSystem = true;
  changes.dispatchEvent(new Event('change'));
  expect(document.documentElement.classList.contains('scar-dark')).toBe(true);
  theme.setPreference('light');
  changes.dispatchEvent(new Event('change'));
  expect(theme.isDark()).toBe(false);
  expect(localStorage.getItem('scar-theme')).toBe('light');
  theme.setPreference('system');
  expect(localStorage.getItem('scar-theme')).toBeNull();
  expect(theme.isDark()).toBe(true);
});

it('restores the stored choice and reacts when another tab resets it', () => {
  localStorage.setItem('scar-theme', 'dark');
  const theme = TestBed.inject(ThemeService);
  expect(theme.isDark()).toBe(true);
  expect(theme.preference()).toBe('dark');
  localStorage.removeItem('scar-theme');
  window.dispatchEvent(new StorageEvent('storage', {key: 'scar-theme'}));
  expect(theme.preference()).toBe('system');
  expect(theme.isDark()).toBe(false);
});

it('supports a temporary preference even when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const theme = TestBed.inject(ThemeService);
  theme.setPreference('dark');
  expect(theme.isDark()).toBe(true);
});

it('prerenders the default without accessing browser preferences', () => {
  TestBed.configureTestingModule({providers: [{provide: PLATFORM_ID, useValue: 'server'}]});
  const media = vi.spyOn(window, 'matchMedia');
  const theme = TestBed.inject(ThemeService);
  expect(theme.preference()).toBe('system');
  expect(media).not.toHaveBeenCalled();
});

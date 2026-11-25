import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {debouncedAction} from './debounced-action';

afterEach(() => vi.useRealTimers());

describe('retardo de consultas', () => {
  it('ejecuta solo el último término después de la espera', () => {
    vi.useFakeTimers();
    const schedule = TestBed.runInInjectionContext(() => debouncedAction(270));
    const stale = vi.fn();
    const final = vi.fn();
    schedule.schedule(stale);
    vi.advanceTimersByTime(200);
    schedule.schedule(final);
    vi.advanceTimersByTime(269);
    expect(final).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(final).toHaveBeenCalledOnce();
    expect(stale).not.toHaveBeenCalled();
  });

  it('cancela trabajo al destruir el contexto', () => {
    vi.useFakeTimers();
    const schedule = TestBed.runInInjectionContext(() => debouncedAction(160));
    const action = vi.fn();
    schedule.schedule(action);
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(160);
    expect(action).not.toHaveBeenCalled();
  });
});

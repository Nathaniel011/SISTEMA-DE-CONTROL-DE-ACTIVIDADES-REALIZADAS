import {describe, expect, it} from 'vitest';
import {countDays, dayNumber, estimatedEnd, isoDay} from './gantt-calendar';

describe('calendario del Gantt', () => {
  it('opera con fechas de calendario al cruzar un cambio de hora', () => {
    expect(dayNumber('2026-03-09')! - dayNumber('2026-03-07')!).toBe(2);
    expect(isoDay(dayNumber('2026-03-07')! + 2)).toBe('2026-03-09');
  });

  it('mantiene la duración inclusiva y salta fines de semana cuando corresponde', () => {
    const friday = dayNumber('2026-11-20')!;
    expect(isoDay(estimatedEnd(friday, 960, true))).toBe('2026-11-23');
    expect(countDays(friday, friday + 3, true)).toBe(2);
    expect(countDays(friday, friday, false)).toBe(1);
  });

  it('distingue fechas ausentes y fechas inválidas', () => {
    expect(dayNumber(null)).toBeNull();
    expect(dayNumber('2026-02-29')).toBeNull();
    expect(dayNumber('2028-02-29')).not.toBeNull();
  });
});

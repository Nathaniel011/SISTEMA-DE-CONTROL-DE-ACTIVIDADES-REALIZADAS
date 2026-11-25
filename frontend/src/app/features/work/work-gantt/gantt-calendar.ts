const DAY_MS = 86_400_000;

export const GANTT_SCALES = {
  day: {label: 'Día', pixels: 43, days: 35},
  week: {label: 'Semana', pixels: 22, days: 91},
  month: {label: 'Mes', pixels: 7, days: 364},
} as const;
export type GanttScale = keyof typeof GANTT_SCALES;

export function dayNumber(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const day = Date.parse(iso + 'T00:00:00Z') / DAY_MS;
  return Number.isInteger(day) && isoDay(day) === iso ? day : null;
}

export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function todayDay(): number {
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS;
}

export function dayLabel(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(day * DAY_MS).toLocaleDateString('es-BO', {...options, timeZone: 'UTC'});
}

export function weekend(day: number): boolean {
  const value = new Date(day * DAY_MS).getUTCDay();
  return value === 0 || value === 6;
}

export function countDays(start: number, end: number, workdaysOnly: boolean): number {
  if (!workdaysOnly) return Math.max(0, end - start + 1);
  let result = 0;
  for (let day = start; day <= end; day++) if (!weekend(day)) result++;
  return result;
}

export function estimatedEnd(start: number, estimate: number | null | undefined, workdaysOnly: boolean): number {
  let end = start;
  if (workdaysOnly) while (weekend(end)) end++;
  let remaining = Math.max(1, Math.ceil((estimate ?? 0) / 480));
  while (remaining > 1) {
    end++;
    if (!workdaysOnly || !weekend(end)) remaining--;
  }
  return end;
}

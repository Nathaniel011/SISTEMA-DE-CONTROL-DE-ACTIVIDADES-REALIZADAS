import {WORK_PRIORITIES, WorkPriority} from './work.models';

export function formatWorkMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatWorkSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function formatWorkDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function priorityMeta(priority: WorkPriority) {
  return WORK_PRIORITIES.find(p => p.value === priority) ?? WORK_PRIORITIES[1];
}

export function isDueSoon(iso: string | null): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  const now = new Date();
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date() && new Date(iso).toDateString() !== new Date().toDateString();
}

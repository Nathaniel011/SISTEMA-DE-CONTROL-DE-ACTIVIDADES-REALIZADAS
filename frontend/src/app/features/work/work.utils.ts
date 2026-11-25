import {environment} from '../../../environments/environment';
import {WORK_PRIORITIES, WorkBoard, WorkPriority, WorkCard} from './work.models';

export const GENERAL_BOARD_LABEL = 'Recepción de solicitudes';
export const WORK_DRAFT_CARD_TITLE = 'Nueva tarjeta';

export function isGeneralBoard(board: Pick<WorkBoard, 'type' | 'key'>): boolean {
  return board.type === 'general' || board.key === 'GEN';
}

export function boardDisplayName(board: Pick<WorkBoard, 'type' | 'key' | 'name'>): string {
  return isGeneralBoard(board) ? GENERAL_BOARD_LABEL : board.name;
}

export function resolveWorkFileUrl(url: string): string {
  if (!url || url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const base = environment.apiUrl.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

export function formatWorkMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTimeOverrun(trackedMinutes: number, estimateMinutes: number | null): string | null {
  if (!estimateMinutes || estimateMinutes <= 0) return null;
  const delta = trackedMinutes - estimateMinutes;
  if (delta <= 0) return null;
  return `+${formatWorkMinutes(delta)} sobre estimación`;
}

export function formatTimeRemaining(trackedMinutes: number, estimateMinutes: number | null): string | null {
  if (!estimateMinutes || estimateMinutes <= 0) return null;
  const remaining = estimateMinutes - trackedMinutes;
  if (remaining <= 0) return null;
  return `${formatWorkMinutes(remaining)} restantes`;
}

export function formatWorkSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function parseWorkDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatWorkDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatWorkDate(iso: string | null): string {
  if (!iso) return '';
  const date = parseWorkDate(iso);
  if (!date) return '';
  return date.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function priorityMeta(priority: WorkPriority) {
  return WORK_PRIORITIES.find(p => p.value === priority) ?? WORK_PRIORITIES[1];
}

export function isDueSoon(iso: string | null): boolean {
  if (!iso) return false;
  const due = parseWorkDate(iso);
  if (!due) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const due = parseWorkDate(iso);
  if (!due) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return dueDay < today;
}

export function getTimeOverrunStatus(card: WorkCard): 'normal' | 'warning' | 'critical' {
  if (!card.estimateMinutes || card.estimateMinutes === 0) return 'normal';
  const ratio = Math.max(0, card.trackedMinutes) / card.estimateMinutes;
  if (ratio >= 1) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'normal';
}

export function getTimeOverrunColor(status: 'normal' | 'warning' | 'critical'): string {
  switch (status) {
    case 'warning': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'critical': return 'bg-red-100 text-red-800 border-red-300';
    default: return 'bg-surface-100 text-surface-600 border-surface-300';
  }
}

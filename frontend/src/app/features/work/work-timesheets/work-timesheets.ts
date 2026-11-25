import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {Select} from 'primeng/select';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {WorkService} from '../../../core/services/work.service';
import {TimeEntryWithIssue, WorkApiService} from '../../../core/services/work-api.service';
import {formatWorkDateISO, formatWorkMinutes, parseWorkDate} from '../work.utils';

type TimesheetScope = 'people' | 'projects' | 'workgroups';
type TimesheetView = 'month' | 'week';
type AddTimeMode = 'dates' | 'range';

const SPANISH_WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const DEFAULT_ACTIVITY_TYPES = ['Trabajo', 'Análisis', 'Desarrollo', 'QA', 'Soporte', 'Reunión', 'Despliegue'];

interface TimesheetRow {
  entry: TimeEntryWithIssue;
  issueKey: string;
  cardLabel: string;
  projectLabel: string;
  memberLabel: string;
  workGroupLabel: string;
}

interface TimesheetDay {
  date: Date;
  iso: string;
  label: string;
  weekday: string;
  inMonth: boolean;
  isToday: boolean;
  entries: TimesheetRow[];
  totalMinutes: number;
}

interface ProjectTimelineDay {
  iso: string;
  dayLabel: string;
  weekdayLabel: string;
  isToday: boolean;
  totalMinutes: number;
}

interface ProjectTimelineRow {
  memberId: string;
  memberLabel: string;
  totalMinutes: number;
  minutesByDate: Partial<Record<string, number>>;
}

interface TimeDateRow {
  id: string;
  date: string;
  timeText: string;
}

@Component({
  selector: 'app-work-timesheets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog, Select, FormsModule, RouterLink],
  templateUrl: './work-timesheets.html',
})
export class WorkTimesheets implements OnInit {
  workService = inject(WorkService);
  private workApi = inject(WorkApiService);

  entries = signal<TimesheetRow[]>([]);
  loadingEntries = signal(false);
  scope = signal<TimesheetScope>('people');
  viewMode = signal<TimesheetView>('month');
  cursorDate = signal(this.startOfMonth(new Date()));
  selectedMemberId = signal<string>('all');
  selectedProjectId = signal<string>('all');
  selectedWorkGroup = signal<string>('all');
  selectedIssueId = signal('');
  addTimeMode = signal<AddTimeMode>('dates');
  dateRows = signal<TimeDateRow[]>([{ id: crypto.randomUUID(), date: formatWorkDateISO(new Date()), timeText: '1h' }]);
  rangeStartDate = signal(formatWorkDateISO(new Date()));
  rangeEndDate = signal(formatWorkDateISO(new Date()));
  rangeTimeText = signal('1h');
  activityType = signal('Trabajo');
  manualNote = signal('');
  showAddForm = signal(false);
  savingManualEntry = signal(false);
  entryError = signal<string | null>(null);

  monthLabel = computed(() =>
    this.cursorDate().toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
  );

  visibleEntries = computed(() => {
    const scope = this.scope();
    return this.entries().filter(row => {
      if (scope === 'people') {
        return this.selectedMemberId() === 'all' || row.entry.memberId === this.selectedMemberId();
      }
      if (scope === 'projects') {
        return this.selectedProjectId() === 'all' || row.entry.projectId === this.selectedProjectId();
      }
      return this.selectedWorkGroup() === 'all' || row.workGroupLabel === this.selectedWorkGroup();
    });
  });

  totalVisibleMinutes = computed(() =>
    this.visibleEntries().reduce((sum, row) => sum + row.entry.minutes, 0)
  );

  calendarDays = computed(() => this.buildCalendarDays());
  projectTimelineDays = computed(() => this.buildProjectTimelineDays());
  projectTimelineRows = computed(() => this.buildProjectTimelineRows());
  selectedProjectLabel = computed(() => {
    const id = this.selectedProjectId();
    if (id === 'all') return 'Todos los proyectos';
    return this.workService.getBoard(id)?.name ?? this.visibleEntries()[0]?.projectLabel ?? 'Proyecto';
  });

  memberOptions = computed(() => [
    { label: 'Todos', value: 'all' },
    ...this.workService.members().map(member => ({ label: member.name, value: member.id })),
  ]);

  projectOptions = computed(() => [
    { label: 'Todos', value: 'all' },
    ...this.workService.boards().map(board => ({ label: board.name, value: board.id })),
  ]);

  workGroupOptions = computed(() => {
    const groups = Array.from(new Set(this.entries().map(row => row.workGroupLabel))).sort();
    return [{ label: 'Todos', value: 'all' }, ...groups.map(group => ({ label: group, value: group }))];
  });

  activityTypeOptions = computed(() => {
    const fromEntries = this.entries().map(row => row.entry.activityType).filter(Boolean);
    const fromCards = this.workService.cards().map(card => card.issueType).filter(Boolean);
    const values = Array.from(new Set([...DEFAULT_ACTIVITY_TYPES, ...fromEntries, ...fromCards] as string[]));
    return values.sort((a, b) => a.localeCompare(b)).map(value => ({ label: value, value }));
  });

  currentAuthorName = computed(() => {
    const memberId = this.workService.currentMemberId();
    return this.workService.getMember(memberId ?? '')?.name ?? 'Usuario';
  });

  async ngOnInit(): Promise<void> {
    await this.workService.ensureAllCards();
    this.selectedIssueId.set(this.workService.cards()[0]?.id ?? '');
    await this.loadEntries();
  }

  async loadEntries(): Promise<void> {
    this.loadingEntries.set(true);
    try {
      const rows = await firstValueFrom(this.workApi.listTimeEntries());
      this.entries.set(
        rows.map(entry => {
          const card = this.workService.getCard(entry.issueId);
          const board = card ? this.workService.getBoard(card.boardId) : undefined;
          const issueKey = card
            ? this.workService.getIssueKey(card)
            : `${entry.projectKey ?? 'ARG'}-${entry.issueNumber ?? ''}`;
          return {
            entry,
            issueKey,
            cardLabel: card ? `${issueKey} — ${card.title}` : `${issueKey} — ${entry.issueTitle}`,
            projectLabel: board?.name ?? entry.projectName,
            memberLabel: this.workService.getMember(entry.memberId)?.name ?? 'Usuario',
            workGroupLabel: card?.issueType?.trim() || entry.issueType?.trim() || 'Sin tipo',
          };
        })
      );
    } finally {
      this.loadingEntries.set(false);
    }
  }

  issueOptions() {
    return this.workService.cards().map(c => ({
      label: `${this.workService.getIssueKey(c)} — ${c.title}`,
      value: c.id,
    }));
  }

  formatMinutes = formatWorkMinutes;

  setScope(scope: TimesheetScope): void {
    this.scope.set(scope);
  }

  setViewMode(mode: TimesheetView): void {
    this.viewMode.set(mode);
    this.cursorDate.set(mode === 'month' ? this.startOfMonth(this.cursorDate()) : this.startOfWeek(this.cursorDate()));
  }

  goToday(): void {
    const today = new Date();
    this.cursorDate.set(this.viewMode() === 'month' ? this.startOfMonth(today) : this.startOfWeek(today));
  }

  previousPeriod(): void {
    const current = this.cursorDate();
    if (this.viewMode() === 'month') {
      this.cursorDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
      return;
    }
    this.cursorDate.set(this.addDays(current, -7));
  }

  nextPeriod(): void {
    const current = this.cursorDate();
    if (this.viewMode() === 'month') {
      this.cursorDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
      return;
    }
    this.cursorDate.set(this.addDays(current, 7));
  }

  async addManualEntry(): Promise<void> {
    const issueId = this.selectedIssueId();
    if (!issueId || this.savingManualEntry()) return;

    const entries = this.buildTimeEntries();
    if (!entries.length) {
      this.entryError.set('Revisa las fechas y el tiempo empleado.');
      return;
    }

    this.entryError.set(null);
    this.savingManualEntry.set(true);
    try {
      for (const entry of entries) {
        await this.workService.logTime(
          issueId,
          entry.minutes,
          this.manualNote(),
          entry.date,
          this.activityType()
        );
      }
      this.manualNote.set('');
      await this.loadEntries();
      this.closeAddTimeDialog();
    } catch {
      this.entryError.set('No se pudo añadir el tiempo empleado.');
    } finally {
      this.savingManualEntry.set(false);
    }
  }

  closeAddTimeDialog(): void {
    this.showAddForm.set(false);
    this.entryError.set(null);
  }

  setAddTimeMode(mode: AddTimeMode): void {
    this.addTimeMode.set(mode);
  }

  addDateRow(): void {
    const rows = this.dateRows();
    const lastDate = rows.at(-1)?.date ?? formatWorkDateISO(new Date());
    const nextDate = formatWorkDateISO(this.addDays(parseWorkDate(lastDate) ?? new Date(), 1));
    this.dateRows.set([...rows, { id: crypto.randomUUID(), date: nextDate, timeText: rows.at(-1)?.timeText ?? '1h' }]);
  }

  removeDateRow(id: string): void {
    if (this.dateRows().length <= 1) return;
    this.dateRows.set(this.dateRows().filter(row => row.id !== id));
  }

  updateDateRow(id: string, patch: Partial<TimeDateRow>): void {
    this.dateRows.set(this.dateRows().map(row => row.id === id ? { ...row, ...patch } : row));
  }

  dayDetails(day: TimesheetDay): string {
    if (!day.entries.length) {
      return 'Sin tiempo registrado';
    }
    return `${this.formatMinutes(day.totalMinutes)} en ${day.entries.length} registro${day.entries.length === 1 ? '' : 's'}`;
  }

  private buildCalendarDays(): TimesheetDay[] {
    const current = this.cursorDate();
    const start = this.viewMode() === 'month'
      ? this.startOfWeek(this.startOfMonth(current))
      : this.startOfWeek(current);
    const totalDays = this.viewMode() === 'month' ? 42 : 7;
    const entriesByDate = this.groupEntriesByDate(this.visibleEntries());
    const todayIso = formatWorkDateISO(new Date());

    return Array.from({ length: totalDays }, (_, index) => {
      const date = this.addDays(start, index);
      const iso = formatWorkDateISO(date);
      const entries = entriesByDate.get(iso) ?? [];
      return {
        date,
        iso,
        label: String(date.getDate()),
        weekday: SPANISH_WEEKDAYS[index % 7],
        inMonth: date.getMonth() === current.getMonth(),
        isToday: iso === todayIso,
        entries,
        totalMinutes: entries.reduce((sum, row) => sum + row.entry.minutes, 0),
      };
    });
  }

  private buildTimeEntries(): { date: string; minutes: number }[] {
    if (this.addTimeMode() === 'dates') {
      return this.dateRows()
        .map(row => ({ date: row.date, minutes: this.parseDuration(row.timeText) }))
        .filter((row): row is { date: string; minutes: number } => !!row.date && !!row.minutes && row.minutes > 0);
    }

    const start = parseWorkDate(this.rangeStartDate());
    const end = parseWorkDate(this.rangeEndDate());
    const minutes = this.parseDuration(this.rangeTimeText());
    if (!start || !end || !minutes || end < start) {
      return [];
    }

    const result: { date: string; minutes: number }[] = [];
    for (let current = start; current <= end; current = this.addDays(current, 1)) {
      result.push({ date: formatWorkDateISO(current), minutes });
    }
    return result;
  }

  private parseDuration(raw: string): number | null {
    const value = raw.trim().toLowerCase().replace(',', '.');
    if (!value) return null;

    const colon = /^(\d{1,2}):(\d{1,2})$/.exec(value);
    if (colon) {
      return Number(colon[1]) * 60 + Number(colon[2]);
    }

    const tokenPattern = /(\d+(?:\.\d+)?)\s*(d|h|m)/g;
    let total = 0;
    let matched = false;
    for (const match of value.matchAll(tokenPattern)) {
      matched = true;
      const amount = Number(match[1]);
      const unit = match[2];
      total += unit === 'd' ? amount * 8 * 60 : unit === 'h' ? amount * 60 : amount;
    }
    if (matched) {
      return Math.round(total);
    }

    const plainMinutes = Number(value);
    return Number.isFinite(plainMinutes) && plainMinutes > 0 ? Math.round(plainMinutes) : null;
  }

  private buildProjectTimelineDays(): ProjectTimelineDay[] {
    const days = this.periodDays();
    const entriesByDate = this.groupEntriesByDate(this.visibleEntries());
    const todayIso = formatWorkDateISO(new Date());
    return days.map(date => {
      const iso = formatWorkDateISO(date);
      const entries = entriesByDate.get(iso) ?? [];
      return {
        iso,
        dayLabel: String(date.getDate()),
        weekdayLabel: this.weekdayLabel(date),
        isToday: iso === todayIso,
        totalMinutes: entries.reduce((sum, row) => sum + row.entry.minutes, 0),
      };
    });
  }

  private buildProjectTimelineRows(): ProjectTimelineRow[] {
    const rows = new Map<string, ProjectTimelineRow>();
    for (const entry of this.visibleEntries()) {
      const date = parseWorkDate(entry.entry.loggedAt);
      if (!date) continue;
      const iso = formatWorkDateISO(date);
      const current = rows.get(entry.entry.memberId) ?? {
        memberId: entry.entry.memberId,
        memberLabel: entry.memberLabel,
        totalMinutes: 0,
        minutesByDate: {},
      };
      current.totalMinutes += entry.entry.minutes;
      current.minutesByDate[iso] = (current.minutesByDate[iso] ?? 0) + entry.entry.minutes;
      rows.set(entry.entry.memberId, current);
    }
    return Array.from(rows.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  private groupEntriesByDate(entries: TimesheetRow[]): Map<string, TimesheetRow[]> {
    const map = new Map<string, TimesheetRow[]>();
    for (const row of entries) {
      const date = parseWorkDate(row.entry.loggedAt);
      if (!date) continue;
      const iso = formatWorkDateISO(date);
      map.set(iso, [...(map.get(iso) ?? []), row]);
    }
    return map;
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private startOfWeek(date: Date): Date {
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return this.addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), mondayOffset);
  }

  private periodDays(): Date[] {
    if (this.viewMode() === 'week') {
      const start = this.startOfWeek(this.cursorDate());
      return Array.from({ length: 7 }, (_, index) => this.addDays(start, index));
    }
    const current = this.cursorDate();
    const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    return Array.from(
      { length: daysInMonth },
      (_, index) => new Date(current.getFullYear(), current.getMonth(), index + 1)
    );
  }

  private weekdayLabel(date: Date): string {
    return SPANISH_WEEKDAYS[(date.getDay() + 6) % 7];
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }
}

import {DatePipe} from '@angular/common';
import {Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {DatePicker} from 'primeng/datepicker';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {ProgressSpinner} from 'primeng/progressspinner';
import {WorkService} from '../../../core/services/work.service';
import {GanttResponse, GanttTask, WorkApiService} from '../../../core/services/work-api.service';
import {environment} from '../../../../environments/environment';
import {firstValueFrom} from 'rxjs';
import {WORK_ISSUE_TYPE_LABELS, WorkCard, WorkColumnId, WorkPriority} from '../work.models';

interface GanttRow {
  id: string;
  key: string;
  title: string;
  start: Date;
  end: Date;
  columnId: WorkColumnId;
  assigneeName: string;
  progress: number;
  parentId: string | null;
  estimateMinutes: number | null;
  priority: WorkPriority;
  issueType: string;
  hasChildren: boolean;
  depth: number;
  estimateLabel: string;
  startLabel: string;
  barColor: string;
  leftPx: number;
  widthPx: number;
  rowType: 'PROJECT' | 'LIST' | 'TASK';
  isSection: boolean;
}

interface DayColumn {
  date: Date;
  iso: string;
  dayLabel: string;
  isWeekend: boolean;
  isToday: boolean;
  weekLabel: string;
}

interface LinkPath {
  id: string;
  d: string;
}

type GanttEditMode = 'move' | 'resize-start' | 'resize-end';

interface GanttDragState {
  taskId: string;
  mode: GanttEditMode;
  startClientX: number;
  originalStartMs: number;
  originalEndMs: number;
  daysPerPixel: number;
}

const MS_PER_DAY = 86_400_000;
const DAY_WIDTH = 42;
const ROW_HEIGHT = 44;
const ALL_PROJECTS = '__all__';

@Component({
  selector: 'app-work-gantt',
  imports: [FormsModule, Button, Select, Tag, ProgressSpinner, RouterLink, DatePicker, DatePipe],
  templateUrl: './work-gantt.html',
})
export class WorkGantt {
  private workService = inject(WorkService);
  private workApi = inject(WorkApiService);
  timelineScroll = viewChild<ElementRef<HTMLDivElement>>('timelineScroll');

  selectedBoardId = signal<string | null>(null);
  loading = signal(false);
  exporting = signal(false);
  recalculating = signal(false);
  gantt = signal<GanttResponse | null>(null);
  rangeStart = signal<Date>(new Date());
  rangeEnd = signal<Date>(new Date());
  savingTaskId = signal<string | null>(null);
  savingDependency = signal(false);
  dependencySourceId = signal<string | null>(null);
  dependencyTargetId = signal<string | null>(null);
  dependencyType = signal('FINISH_TO_START');
  weekPicker = signal<Date>(this.mondayOf(new Date()));
  collapsedIds = signal<Set<string>>(new Set());
  private taskPreview = signal<{ taskId: string; start: Date; end: Date } | null>(null);
  private dragState: GanttDragState | null = null;

  boardOptions = computed(() => [
    { label: 'Todos los proyectos', value: ALL_PROJECTS },
    ...this.workService.boards().filter(b => b.type !== 'general').map(b => ({ label: b.name, value: b.id })),
  ]);

  selectedBoard = computed(() => {
    const id = this.selectedBoardId();
    if (!id || id === ALL_PROJECTS) return null;
    return this.workService.boards().find(b => b.id === id) ?? null;
  });

  taskOptions = computed(() =>
    (this.gantt()?.tasks ?? [])
      .filter(task => (task.rowType ?? 'TASK') === 'TASK')
      .map(task => ({
        label: `${task.key} - ${task.title}`,
        value: task.id,
      }))
  );

  dependencyTypeOptions = [
    { label: 'Fin a inicio', value: 'FINISH_TO_START' },
    { label: 'Inicio a inicio', value: 'START_TO_START' },
  ];

  canAddDependency = computed(() => {
    const source = this.dependencySourceId();
    const target = this.dependencyTargetId();
    return !!source && !!target && source !== target && !this.savingDependency();
  });

  dayColumns = computed<DayColumn[]>(() => {
    const start = this.startOfDay(this.rangeStart());
    const end = this.startOfDay(this.rangeEnd());
    const days: DayColumn[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const week = this.isoWeek(cursor);
      days.push({
        date: new Date(cursor),
        iso: this.toIsoDate(cursor),
        dayLabel: cursor.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
        isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
        isToday: this.isSameDay(cursor, new Date()),
        weekLabel: `W ${week}`,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  });

  weekGroups = computed(() => {
    const days = this.dayColumns();
    const groups: { label: string; span: number }[] = [];
    for (const day of days) {
      const last = groups[groups.length - 1];
      if (last && last.label === day.weekLabel) {
        last.span += 1;
      } else {
        groups.push({ label: day.weekLabel, span: 1 });
      }
    }
    return groups;
  });

  timelineWidth = computed(() => Math.max(this.dayColumns().length * DAY_WIDTH, DAY_WIDTH * 7));

  todayLeftPx = computed(() => {
    const today = this.startOfDay(new Date());
    const start = this.startOfDay(this.rangeStart());
    const days = Math.round((today.getTime() - start.getTime()) / MS_PER_DAY);
    if (days < 0 || days > this.dayColumns().length) return null;
    return days * DAY_WIDTH + DAY_WIDTH / 2;
  });

  visibleRows = computed<GanttRow[]>(() => {
    const data = this.gantt();
    if (!data?.tasks.length) return [];

    const preview = this.taskPreview();
    const collapsed = this.collapsedIds();
    const startMs = this.rangeStart().getTime();
    const parentById = new Map(data.tasks.map(t => [t.id, t.parentId ?? null]));

    const isHidden = (taskId: string): boolean => {
      let parentId = parentById.get(taskId) ?? null;
      while (parentId) {
        if (collapsed.has(parentId)) return true;
        parentId = parentById.get(parentId) ?? null;
      }
      return false;
    };

    const depthOf = (taskId: string): number => {
      let depth = 0;
      let parentId = parentById.get(taskId) ?? null;
      while (parentId) {
        depth++;
        parentId = parentById.get(parentId) ?? null;
      }
      return depth;
    };

    const rows: GanttRow[] = [];
    for (const task of data.tasks) {
      if (isHidden(task.id)) continue;

      const rowType = (task.rowType ?? 'TASK') as GanttRow['rowType'];
      const isSection = rowType === 'PROJECT' || rowType === 'LIST';
      const start = preview?.taskId === task.id ? preview.start : this.parseDate(task.start);
      const end = preview?.taskId === task.id ? preview.end : this.parseDate(task.end);
      const leftDays = (this.startOfDay(start).getTime() - startMs) / MS_PER_DAY;
      const widthDays = Math.max((this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / MS_PER_DAY + 1, 1);

      rows.push({
        id: task.id,
        key: task.key,
        title: task.title,
        start,
        end,
        columnId: (task.columnId ?? 'backlog') as WorkColumnId,
        assigneeName: task.assigneeName ?? 'Sin asignar',
        progress: task.progress,
        parentId: task.parentId ?? null,
        estimateMinutes: task.estimateMinutes ?? null,
        priority: (task.priority ?? 'medium') as WorkPriority,
        issueType: task.issueType ?? '',
        hasChildren: !!task.hasChildren,
        depth: depthOf(task.id),
        estimateLabel: isSection ? '—' : this.formatEstimate(task.estimateMinutes),
        startLabel: isSection ? '—' : start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        barColor: isSection
          ? rowType === 'PROJECT' ? 'var(--p-surface-400)' : 'var(--p-surface-300)'
          : this.barColor(task.columnId as WorkColumnId, task.priority as WorkPriority),
        leftPx: Math.max(leftDays * DAY_WIDTH, 0),
        widthPx: Math.max(widthDays * DAY_WIDTH - 4, isSection ? 20 : 12),
        rowType,
        isSection,
      });
    }
    return rows;
  });

  linkPaths = computed<LinkPath[]>(() => {
    const data = this.gantt();
    const rows = this.visibleRows();
    if (!data?.links.length || !rows.length) return [];

    const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
    const paths: LinkPath[] = [];

    for (const link of data.links) {
      const sourceIdx = rowIndex.get(link.source);
      const targetIdx = rowIndex.get(link.target);
      if (sourceIdx == null || targetIdx == null) continue;
      const source = rows[sourceIdx];
      const target = rows[targetIdx];
      if (source.isSection || target.isSection) continue;
      const x1 = source.leftPx + source.widthPx;
      const y1 = sourceIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = target.leftPx;
      const y2 = targetIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const midX = x1 + Math.max(16, (x2 - x1) / 2);
      paths.push({
        id: link.id,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      });
    }
    return paths;
  });

  projectMeta = computed(() => {
    const data = this.gantt();
    if (!data) return null;
    const board = this.selectedBoard();
    const isAll = this.selectedBoardId() === ALL_PROJECTS;
    return {
      name: isAll ? 'Todos los proyectos' : (board?.name ?? 'Proyecto'),
      start: data.projectStart ? this.parseDate(data.projectStart) : this.rangeStart(),
      end: data.projectEnd ? this.parseDate(data.projectEnd) : this.rangeEnd(),
      duration: data.durationLabel ?? '',
    };
  });

  constructor() {
    effect(() => {
      const boards = this.workService.boards();
      const current = this.selectedBoardId();
      if (!boards.length) return;
      const ganttBoards = boards.filter(b => b.type !== 'general');
      const boardId = current && (current === ALL_PROJECTS || boards.some(b => b.id === current))
        ? current
        : ALL_PROJECTS;
      untracked(() => {
        if (boardId !== current) this.selectedBoardId.set(boardId);
        void this.loadGantt(boardId);
      });
    });
  }

  async onBoardChange(boardId: string): Promise<void> {
    this.selectedBoardId.set(boardId);
    this.collapsedIds.set(new Set());
    await this.loadGantt(boardId);
  }

  toggleCollapse(taskId: string): void {
    this.collapsedIds.update(set => {
      const next = new Set(set);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  scrollToToday(): void {
    const left = this.todayLeftPx();
    const el = this.timelineScroll()?.nativeElement;
    if (left == null || !el) return;
    el.scrollLeft = Math.max(left - el.clientWidth / 2, 0);
  }

  async recalculate(): Promise<void> {
    const boardId = this.selectedBoardId();
    if (!boardId || boardId === ALL_PROJECTS) return;
    this.recalculating.set(true);
    try {
      const data = await firstValueFrom(this.workApi.recalculateGantt(boardId));
      this.gantt.set(data);
      this.computeRange(data);
    } finally {
      this.recalculating.set(false);
    }
  }

  async exportWeeklyPlan(): Promise<void> {
    const boardId = this.selectedBoardId();
    const projectId = boardId && boardId !== ALL_PROJECTS ? boardId : undefined;
    const weekStart = this.toIsoDate(this.mondayOf(this.weekPicker()));
    this.exporting.set(true);
    try {
      const blob = await firstValueFrom(this.workApi.exportWeeklyPlan(projectId, weekStart));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Sprint_Programacion_${weekStart}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      this.exporting.set(false);
    }
  }

  beginTaskEdit(event: PointerEvent, row: GanttRow, mode: GanttEditMode): void {
    if (row.isSection) return;
    event.preventDefault();
    event.stopPropagation();
    const track = (event.currentTarget as HTMLElement).closest('.gantt-yt-track') as HTMLElement | null;
    const width = Math.max(track?.clientWidth ?? 1, 1);
    const rangeMs = Math.max(this.rangeEnd().getTime() - this.rangeStart().getTime(), MS_PER_DAY);
    this.dragState = {
      taskId: row.id,
      mode,
      startClientX: event.clientX,
      originalStartMs: this.startOfDay(row.start).getTime(),
      originalEndMs: this.startOfDay(row.end).getTime(),
      daysPerPixel: rangeMs / MS_PER_DAY / width,
    };
    this.taskPreview.set({ taskId: row.id, start: row.start, end: row.end });
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragState) return;
    const drag = this.dragState;
    const deltaDays = Math.round((event.clientX - drag.startClientX) * drag.daysPerPixel);
    const deltaMs = deltaDays * MS_PER_DAY;
    let nextStart = drag.originalStartMs;
    let nextEnd = drag.originalEndMs;
    if (drag.mode === 'move') {
      nextStart += deltaMs;
      nextEnd += deltaMs;
    } else if (drag.mode === 'resize-start') {
      nextStart = Math.min(drag.originalStartMs + deltaMs, drag.originalEndMs - MS_PER_DAY);
    } else {
      nextEnd = Math.max(drag.originalEndMs + deltaMs, drag.originalStartMs + MS_PER_DAY);
    }
    this.taskPreview.set({ taskId: drag.taskId, start: new Date(nextStart), end: new Date(nextEnd) });
  }

  @HostListener('document:pointerup')
  onPointerUp(): void {
    const preview = this.taskPreview();
    const drag = this.dragState;
    if (!preview || !drag) return;
    this.dragState = null;
    this.taskPreview.set(null);
    if (preview.start.getTime() === drag.originalStartMs && preview.end.getTime() === drag.originalEndMs) return;
    void this.persistTaskDates(preview.taskId, preview.start, preview.end);
  }

  async addDependency(): Promise<void> {
    const source = this.dependencySourceId();
    const target = this.dependencyTargetId();
    if (!source || !target || source === target) return;
    this.savingDependency.set(true);
    try {
      if (environment.useApi) {
        const link = await firstValueFrom(this.workApi.addDependency(target, source, this.dependencyType()));
        this.gantt.update(data => data ? { ...data, links: [...data.links, link] } : data);
      } else {
        this.gantt.update(data => data ? {
          ...data,
          links: [...data.links, { id: crypto.randomUUID(), source, target, type: this.dependencyType() }],
        } : data);
      }
      this.dependencySourceId.set(null);
      this.dependencyTargetId.set(null);
    } finally {
      this.savingDependency.set(false);
    }
  }

  async removeDependency(id: string): Promise<void> {
    if (environment.useApi) await firstValueFrom(this.workApi.removeDependency(id));
    this.gantt.update(data => data ? { ...data, links: data.links.filter(link => link.id !== id) } : data);
  }

  taskLabel(id: string): string {
    const task = this.gantt()?.tasks.find(t => t.id === id);
    return task ? `${task.key} - ${task.title}` : id;
  }

  priorityLabel(priority: WorkPriority): string {
    const labels: Record<WorkPriority, string> = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      critical: 'Crítica',
    };
    return labels[priority] ?? priority;
  }

  issueTypeLabel(type: string): string {
    return WORK_ISSUE_TYPE_LABELS[type as keyof typeof WORK_ISSUE_TYPE_LABELS] ?? type;
  }

  private async loadGantt(boardId: string): Promise<void> {
    if (!environment.useApi) {
      this.buildLocalGantt(boardId);
      return;
    }
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        boardId === ALL_PROJECTS ? this.workApi.gantt() : this.workApi.gantt(boardId)
      );
      this.gantt.set(data);
      this.computeRange(data);
      setTimeout(() => this.scrollToToday(), 0);
    } finally {
      this.loading.set(false);
    }
  }

  private buildLocalGantt(boardId: string): void {
    const boards = boardId === ALL_PROJECTS
      ? this.workService.boards().filter(b => b.type !== 'general')
      : this.workService.boards().filter(b => b.id === boardId);
    const today = new Date();
    const tasks: GanttTask[] = [];

    for (const board of boards) {
      if (boardId === ALL_PROJECTS) {
        tasks.push({
          id: `section-project-${board.id}`,
          key: board.key,
          title: board.name,
          start: this.toIsoDate(today),
          end: this.toIsoDate(new Date(today.getTime() + 7 * MS_PER_DAY)),
          columnId: 'backlog',
          assigneeName: '',
          progress: 0,
          parentId: null,
          hasChildren: true,
          rowType: 'PROJECT',
          projectId: board.id,
        });
      }

      const lists = this.workService.getBoardLists(board.id);
      const cards = this.workService.cards().filter(c => c.boardId === board.id);
      const listParent = boardId === ALL_PROJECTS ? `section-project-${board.id}` : null;

      for (const list of lists) {
        const listCards = cards.filter(c => c.boardListId === list.id);
        if (!listCards.length) continue;
        const listSectionId = `section-list-${list.id}`;
        tasks.push({
          id: listSectionId,
          key: '',
          title: list.name,
          start: this.toIsoDate(today),
          end: this.toIsoDate(new Date(today.getTime() + 7 * MS_PER_DAY)),
          columnId: 'backlog',
          assigneeName: '',
          progress: 0,
          parentId: listParent,
          hasChildren: true,
          rowType: 'LIST',
          projectId: board.id,
          boardListId: list.id,
        });

        const roots = listCards.filter(c => !c.parentIssueId || !listCards.some(x => x.id === c.parentIssueId));
        for (const card of roots) {
          this.appendLocalCardTree(tasks, card, listSectionId, board.id, cards, today);
        }
      }
    }

    const data: GanttResponse = {
      projectStart: this.toIsoDate(today),
      projectEnd: this.toIsoDate(new Date(today.getTime() + 14 * MS_PER_DAY)),
      durationLabel: '',
      hierarchical: true,
      tasks,
      links: [],
    };
    this.gantt.set(data);
    this.computeRange(data);
  }

  private appendLocalCardTree(
    tasks: GanttTask[],
    card: WorkCard,
    parentId: string,
    boardId: string,
    allCards: WorkCard[],
    today: Date
  ): void {
    const taskStart = card.startDate ? this.parseDate(card.startDate) : today;
    const end = card.endDate
      ? this.parseDate(card.endDate)
      : card.dueDate ? this.parseDate(card.dueDate) : new Date(taskStart.getTime() + 5 * MS_PER_DAY);
    const children = allCards.filter(c => c.parentIssueId === card.id);
    tasks.push({
      id: card.id,
      key: this.workService.getIssueKey(card),
      title: card.title,
      start: this.toIsoDate(taskStart),
      end: this.toIsoDate(end),
      columnId: card.columnId,
      assigneeName: this.workService.getMember(card.assigneeId)?.name ?? 'Sin asignar',
      progress: card.columnId === 'done' ? 100 : card.columnId === 'in_progress' ? 50 : 10,
      parentId,
      estimateMinutes: card.estimateMinutes,
      priority: card.priority,
      issueType: card.issueType ?? '',
      hasChildren: children.length > 0,
      rowType: 'TASK',
      projectId: boardId,
      boardListId: card.boardListId,
    });
    for (const child of children) {
      this.appendLocalCardTree(tasks, child, card.id, boardId, allCards, today);
    }
  }

  private computeRange(data: GanttResponse): void {
    if (!data.tasks.length) {
      const now = new Date();
      this.rangeStart.set(this.mondayOf(now));
      this.rangeEnd.set(new Date(this.mondayOf(now).getTime() + 34 * MS_PER_DAY));
      return;
    }
    const starts = data.tasks.map(t => this.parseDate(t.start).getTime());
    const ends = data.tasks.map(t => this.parseDate(t.end).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    min.setDate(min.getDate() - 3);
    max.setDate(max.getDate() + 10);
    this.rangeStart.set(min);
    this.rangeEnd.set(max);
  }

  private async persistTaskDates(taskId: string, start: Date, end: Date): Promise<void> {
    const boardId = this.selectedBoardId();
    this.savingTaskId.set(taskId);
    try {
      const startDate = this.toIsoDate(start);
      const endDate = this.toIsoDate(end);
      if (environment.useApi) {
        const updated = await firstValueFrom(this.workApi.updateGanttTaskDates(taskId, startDate, endDate));
        this.gantt.update(data => data ? {
          ...data,
          tasks: data.tasks.map(task => task.id === taskId ? { ...task, ...updated } : task),
        } : data);
        this.workService.updateCard(taskId, { startDate, endDate, dueDate: endDate });
      } else {
        this.workService.updateCard(taskId, { startDate, endDate, dueDate: endDate });
        if (boardId && boardId !== ALL_PROJECTS) this.buildLocalGantt(boardId);
      }
    } finally {
      this.savingTaskId.set(null);
    }
  }

  private formatEstimate(minutes: number | null | undefined): string {
    if (!minutes || minutes <= 0) return '—';
    if (minutes < 60) return `${minutes}m`;
    const hours = minutes / 60;
    if (hours < 8) return `${Math.round(hours)}h`;
    const days = hours / 8;
    if (days < 5) return `${Math.ceil(days)}d`;
    const weeks = Math.floor(days / 5);
    const remDays = Math.ceil(days % 5);
    return remDays > 0 ? `${weeks}s ${remDays}d` : `${weeks}s`;
  }

  private barColor(columnId: WorkColumnId, priority: WorkPriority): string {
    if (columnId === 'done' || columnId === 'closed') return 'var(--p-green-500)';
    if (priority === 'critical' || priority === 'high') return 'var(--p-orange-500)';
    if (columnId === 'in_progress' || columnId === 'review') return 'var(--p-blue-500)';
    return 'var(--p-primary-500)';
  }

  private mondayOf(date: Date): Date {
    const d = this.startOfDay(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  private isoWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1) / 7);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

import {Component, HostListener, computed, effect, inject, signal, untracked} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {ProgressSpinner} from 'primeng/progressspinner';
import {WorkService} from '../../../core/services/work.service';
import {GanttResponse, WorkApiService} from '../../../core/services/work-api.service';
import {environment} from '../../../../environments/environment';
import {firstValueFrom} from 'rxjs';
import {WORK_STATUS_LABELS, WorkColumnId} from '../work.models';

interface TimelineTask {
  id: string;
  key: string;
  title: string;
  start: Date;
  end: Date;
  columnId: WorkColumnId;
  assigneeName: string;
  progress: number;
  leftPct: number;
  widthPct: number;
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

@Component({
  selector: 'app-work-gantt',
  imports: [FormsModule, Button, Select, Tag, ProgressSpinner, RouterLink],
  templateUrl: './work-gantt.html',
})
export class WorkGantt {
  private workService = inject(WorkService);
  private workApi = inject(WorkApiService);

  selectedBoardId = signal<string | null>(null);
  loading = signal(false);
  gantt = signal<GanttResponse | null>(null);
  rangeStart = signal<Date>(new Date());
  rangeEnd = signal<Date>(new Date());
  savingTaskId = signal<string | null>(null);
  savingDependency = signal(false);
  dependencySourceId = signal<string | null>(null);
  dependencyTargetId = signal<string | null>(null);
  dependencyType = signal('FINISH_TO_START');
  private taskPreview = signal<{ taskId: string; start: Date; end: Date } | null>(null);
  private dragState: GanttDragState | null = null;

  boardOptions = computed(() =>
    this.workService.boards().map(b => ({ label: b.name, value: b.id }))
  );

  taskOptions = computed(() =>
    (this.gantt()?.tasks ?? []).map(task => ({
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

  timelineTasks = computed(() => {
    const data = this.gantt();
    if (!data?.tasks.length) {
      return [] as TimelineTask[];
    }

    const preview = this.taskPreview();
    const startMs = this.rangeStart().getTime();
    const endMs = this.rangeEnd().getTime();
    const span = Math.max(endMs - startMs, MS_PER_DAY);

    return data.tasks.map(task => {
      const start = preview?.taskId === task.id ? preview.start : this.parseDate(task.start);
      const end = preview?.taskId === task.id ? preview.end : this.parseDate(task.end);
      const leftPct = ((start.getTime() - startMs) / span) * 100;
      const clampedLeft = Math.min(Math.max(leftPct, 0), 100);
      const widthPct = Math.max(((end.getTime() - start.getTime()) / span) * 100, 2);
      return {
        id: task.id,
        key: task.key,
        title: task.title,
        start,
        end,
        columnId: task.columnId,
        assigneeName: task.assigneeName,
        progress: task.progress,
        leftPct: clampedLeft,
        widthPct: Math.max(2, Math.min(widthPct, 100 - clampedLeft)),
      };
    });
  });

  monthMarkers = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    const markers: { label: string; leftPct: number }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const span = Math.max(end.getTime() - start.getTime(), MS_PER_DAY);

    while (cursor <= end) {
      markers.push({
        label: cursor.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        leftPct: ((cursor.getTime() - start.getTime()) / span) * 100,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return markers;
  });

  constructor() {
    effect(() => {
      const boards = this.workService.boards();
      const current = this.selectedBoardId();
      if (!boards.length) {
        return;
      }
      const boardId = current && boards.some(b => b.id === current) ? current : boards[0].id;
      untracked(() => {
        if (boardId !== current) {
          this.selectedBoardId.set(boardId);
        }
        void this.loadGantt(boardId);
      });
    });
  }

  statusLabel(columnId: WorkColumnId): string {
    return WORK_STATUS_LABELS[columnId];
  }

  async onBoardChange(boardId: string): Promise<void> {
    this.selectedBoardId.set(boardId);
    await this.loadGantt(boardId);
  }

  beginTaskEdit(event: PointerEvent, task: TimelineTask, mode: GanttEditMode): void {
    event.preventDefault();
    event.stopPropagation();
    const track = (event.currentTarget as HTMLElement).closest('.gantt-row-track') as HTMLElement | null;
    const width = Math.max(track?.clientWidth ?? 1, 1);
    const rangeMs = Math.max(this.rangeEnd().getTime() - this.rangeStart().getTime(), MS_PER_DAY);
    this.dragState = {
      taskId: task.id,
      mode,
      startClientX: event.clientX,
      originalStartMs: this.startOfDay(task.start).getTime(),
      originalEndMs: this.startOfDay(task.end).getTime(),
      daysPerPixel: rangeMs / MS_PER_DAY / width,
    };
    this.taskPreview.set({ taskId: task.id, start: task.start, end: task.end });
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragState) {
      return;
    }
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

    this.taskPreview.set({
      taskId: drag.taskId,
      start: new Date(nextStart),
      end: new Date(nextEnd),
    });
  }

  @HostListener('document:pointerup')
  onPointerUp(): void {
    const preview = this.taskPreview();
    const drag = this.dragState;
    if (!preview || !drag) {
      return;
    }
    this.dragState = null;
    this.taskPreview.set(null);
    if (preview.start.getTime() === drag.originalStartMs && preview.end.getTime() === drag.originalEndMs) {
      return;
    }
    void this.persistTaskDates(preview.taskId, preview.start, preview.end);
  }

  async addDependency(): Promise<void> {
    const source = this.dependencySourceId();
    const target = this.dependencyTargetId();
    if (!source || !target || source === target) {
      return;
    }
    this.savingDependency.set(true);
    try {
      if (environment.useApi) {
        const link = await firstValueFrom(this.workApi.addDependency(target, source, this.dependencyType()));
        this.gantt.update(data => data ? { ...data, links: [...data.links, link] } : data);
      } else {
        this.gantt.update(data => data ? {
          ...data,
          links: [
            ...data.links,
            { id: crypto.randomUUID(), source, target, type: this.dependencyType() },
          ],
        } : data);
      }
      this.dependencySourceId.set(null);
      this.dependencyTargetId.set(null);
    } finally {
      this.savingDependency.set(false);
    }
  }

  async removeDependency(id: string): Promise<void> {
    if (environment.useApi) {
      await firstValueFrom(this.workApi.removeDependency(id));
    }
    this.gantt.update(data => data ? { ...data, links: data.links.filter(link => link.id !== id) } : data);
  }

  taskLabel(id: string): string {
    const task = this.gantt()?.tasks.find(t => t.id === id);
    return task ? `${task.key} - ${task.title}` : id;
  }

  dateLabel(date: Date): string {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  private async loadGantt(projectId: string): Promise<void> {
    if (!environment.useApi) {
      this.buildLocalGantt(projectId);
      return;
    }

    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.workApi.gantt(projectId));
      this.gantt.set(data);
      this.computeRange(data);
    } finally {
      this.loading.set(false);
    }
  }

  private buildLocalGantt(projectId: string): void {
    const cards = this.workService.cards().filter(c => c.boardId === projectId);
    const today = new Date();
    const tasks = cards.map((card, index) => {
      const start = card.dueDate
        ? new Date(this.parseDate(card.dueDate).getTime() - 7 * MS_PER_DAY)
        : new Date(today.getTime() + index * MS_PER_DAY);
      const taskStart = card.startDate ? this.parseDate(card.startDate) : start;
      const end = card.endDate
        ? this.parseDate(card.endDate)
        : card.dueDate ? this.parseDate(card.dueDate) : new Date(taskStart.getTime() + 5 * MS_PER_DAY);
      return {
        id: card.id,
        key: this.workService.getIssueKey(card),
        title: card.title,
        start: this.toIsoDate(taskStart),
        end: this.toIsoDate(end),
        columnId: card.columnId,
        assigneeName: this.workService.getMember(card.assigneeId)?.name ?? 'Sin asignar',
        progress: card.columnId === 'done' ? 100 : card.columnId === 'in_progress' ? 50 : 10,
      };
    });
    const data: GanttResponse = { tasks, links: [] };
    this.gantt.set(data);
    this.computeRange(data);
  }

  private computeRange(data: GanttResponse): void {
    if (!data.tasks.length) {
      const now = new Date();
      this.rangeStart.set(new Date(now.getFullYear(), now.getMonth(), 1));
      this.rangeEnd.set(new Date(now.getFullYear(), now.getMonth() + 2, 0));
      return;
    }

    const starts = data.tasks.map(t => this.parseDate(t.start).getTime());
    const ends = data.tasks.map(t => this.parseDate(t.end).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);
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
          tasks: data.tasks.map(task => task.id === taskId ? updated : task),
        } : data);
        this.workService.updateCard(taskId, { startDate, endDate, dueDate: endDate });
      } else {
        this.workService.updateCard(taskId, { startDate, endDate, dueDate: endDate });
        if (boardId) {
          this.buildLocalGantt(boardId);
        }
      }
    } finally {
      this.savingTaskId.set(null);
    }
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

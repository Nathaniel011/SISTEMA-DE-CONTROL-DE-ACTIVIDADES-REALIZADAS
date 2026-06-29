import {Component, computed, effect, inject, signal, untracked} from '@angular/core';
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

@Component({
  selector: 'app-work-gantt',
  imports: [FormsModule, Button, Select, Tag, ProgressSpinner, RouterLink],
  templateUrl: './work-gantt.html',
})
export class WorkGantt {
  private workService = inject(WorkService);
  private workApi = inject(WorkApiService);

  selectedProjectId = signal<string | null>(null);
  loading = signal(false);
  gantt = signal<GanttResponse | null>(null);
  rangeStart = signal<Date>(new Date());
  rangeEnd = signal<Date>(new Date());

  projectOptions = computed(() =>
    this.workService.boards().map(b => ({ label: b.name, value: b.id }))
  );

  timelineTasks = computed(() => {
    const data = this.gantt();
    if (!data?.tasks.length) {
      return [] as TimelineTask[];
    }

    const startMs = this.rangeStart().getTime();
    const endMs = this.rangeEnd().getTime();
    const span = Math.max(endMs - startMs, 86_400_000);

    return data.tasks.map(task => {
      const start = new Date(task.start);
      const end = new Date(task.end);
      const leftPct = ((start.getTime() - startMs) / span) * 100;
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
        leftPct: Math.min(Math.max(leftPct, 0), 100),
        widthPct: Math.min(widthPct, 100 - leftPct),
      };
    });
  });

  monthMarkers = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    const markers: { label: string; leftPct: number }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const span = Math.max(end.getTime() - start.getTime(), 86_400_000);

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
      const current = this.selectedProjectId();
      if (!boards.length) {
        return;
      }
      const projectId = current && boards.some(b => b.id === current) ? current : boards[0].id;
      untracked(() => {
        if (projectId !== current) {
          this.selectedProjectId.set(projectId);
        }
        void this.loadGantt(projectId);
      });
    });
  }

  statusLabel(columnId: WorkColumnId): string {
    return WORK_STATUS_LABELS[columnId];
  }

  async onProjectChange(projectId: string): Promise<void> {
    this.selectedProjectId.set(projectId);
    await this.loadGantt(projectId);
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
        ? new Date(new Date(card.dueDate).getTime() - 7 * 86_400_000)
        : new Date(today.getTime() + index * 86_400_000);
      const end = card.dueDate ? new Date(card.dueDate) : new Date(start.getTime() + 5 * 86_400_000);
      return {
        id: card.id,
        key: this.workService.getIssueKey(card),
        title: card.title,
        start: start.toISOString(),
        end: end.toISOString(),
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

    const starts = data.tasks.map(t => new Date(t.start).getTime());
    const ends = data.tasks.map(t => new Date(t.end).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);
    this.rangeStart.set(min);
    this.rangeEnd.set(max);
  }
}


import {ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Params, Router, RouterLink} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {environment} from '../../../../environments/environment';
import {WorkJobApi} from '../../../core/services/work-job-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkCard} from '../work.models';
import {boardDisplayName, formatWorkDate, formatWorkDateISO, parseWorkDate} from '../work.utils';

const dayFormatter = new Intl.DateTimeFormat('es-BO', {weekday: 'short', day: 'numeric'});

function shiftDay(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function mondayOf(value: Date): Date {
  return shiftDay(value, -((value.getDay() + 6) % 7));
}

@Component({
  selector: 'app-work-planning',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, Dialog, InputText, Select, WorkCardDrawer, WorkSkeleton],
  templateUrl: './work-planning.html',
})
export class WorkPlanning {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private readonly jobs = inject(WorkJobApi);
  private readonly destroy = inject(DestroyRef);
  protected work = inject(WorkService);
  private params = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});

  protected demo = !environment.useApi;
  protected loading = signal(true);
  protected loadError = signal(false);
  protected exporting = signal(false);
  protected notice = signal('');
  protected exportError = signal(false);
  protected saving = signal(false);
  protected scheduleError = signal('');
  protected schedulingId = signal<string | null>(null);
  protected startDate = signal('');
  protected endDate = signal('');
  protected formatDate = formatWorkDate;

  protected boardId = computed(() => this.params().get('board'));
  protected memberId = computed(() => this.params().get('member'));
  protected issueId = computed(() => this.params().get('issue'));
  protected openCard = computed(() => this.loading() || this.loadError() ? undefined : this.work.getCard(this.issueId() ?? ''));
  protected schedulingCard = computed(() => this.work.getCard(this.schedulingId() ?? ''));

  protected week = computed(() => {
    const raw = this.params().get('week');
    const parsed = parseWorkDate(raw);
    return mondayOf(parsed && formatWorkDateISO(parsed) === raw ? parsed : new Date());
  });
  protected weekStart = computed(() => formatWorkDateISO(this.week()));
  protected weekEnd = computed(() => formatWorkDateISO(shiftDay(this.week(), 6)));
  protected today = formatWorkDateISO(new Date());
  protected boardOptions = computed(() => [
    {label: 'Todos los tableros', value: null},
    ...this.work.standardBoards().map(board => ({label: boardDisplayName(board), value: board.id})),
  ]);

  protected memberOptions = computed(() => {
    const board = this.boardId() && this.work.getBoard(this.boardId()!);
    const members = board ? this.work.members().filter(member => board.memberIds.includes(member.id)) : this.work.members();
    return [
      {label: 'Todos los responsables', value: null},
      {label: 'Asignadas a mí', value: 'me'},
      {label: 'Sin asignar', value: 'none'},
      ...members.map(member => ({label: member.name, value: member.id})),
    ];
  });

  private cards = computed(() => {
    const boards = new Set(this.work.standardBoards().map(board => board.id));
    const board = this.boardId();
    const member = this.memberId();
    const memberId = member === 'me' ? this.work.currentMemberId() : member;
    return this.work.cards().filter(card => {
      if (!boards.has(card.boardId) || (board && card.boardId !== board)) return false;
      if (member === 'none') return !card.assigneeId;
      return !member || (!!memberId && card.assigneeId === memberId);
    });
  });

  protected unscheduled = computed(() => this.cards().filter(card =>
    !card.startDate && !card.endDate && card.columnId !== 'done' && card.columnId !== 'closed',
  ).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));

  protected days = computed(() => {
    const start = this.weekStart();
    const end = this.weekEnd();
    const byDay = new Map<string, WorkCard[]>();
    for (const card of this.cards()) {
      const first = card.startDate || card.endDate;
      const last = card.endDate || card.startDate;
      if (!first || !last || first > end || last < start) continue;
      const date = first < start ? start : first;
      const cards = byDay.get(date) ?? [];
      cards.push(card);
      byDay.set(date, cards);
    }
    return Array.from({length: 7}, (_, day) => {
      const date = shiftDay(this.week(), day);
      const iso = formatWorkDateISO(date);
      return {iso, label: dayFormatter.format(date), cards: byDay.get(iso) ?? []};
    });
  });
  protected scheduledCount = computed(() => this.days().reduce((sum, day) => sum + day.cards.length, 0));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.work.ensureAllCards(true);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected changeWeek(weeks: number): void {
    this.changeQuery({week: formatWorkDateISO(shiftDay(this.week(), weeks * 7))});
  }

  protected changeQuery(queryParams: Params): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge'});
  }

  protected closeIssue(): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams: {issue: null}, queryParamsHandling: 'merge', replaceUrl: true});
  }

  protected openSchedule(card: WorkCard): void {
    this.scheduleError.set('');
    const initial = this.today >= this.weekStart() && this.today <= this.weekEnd() ? this.today : this.weekStart();
    this.startDate.set(card.startDate || card.endDate || initial);
    this.endDate.set(card.endDate || card.startDate || initial);
    this.schedulingId.set(card.id);
  }

  protected closeSchedule(): void {
    if (!this.saving()) this.schedulingId.set(null);
  }

  protected async saveSchedule(): Promise<void> {
    const card = this.schedulingCard();
    const startDate = this.startDate();
    const endDate = this.endDate();
    if (!card || !startDate || !endDate || this.saving()) return;
    if (endDate < startDate) {
      this.scheduleError.set('El fin planificado no puede ser anterior al inicio.');
      return;
    }
    this.saving.set(true);
    this.scheduleError.set('');
    try {
      await this.work.updateCardAsync(card.id, {startDate, endDate});
      this.schedulingId.set(null);
      this.notice.set(this.work.getIssueKey(card) + ' · Plan actualizado.');
    } catch (error) {
      this.scheduleError.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'Tu cuenta no tiene permiso para editar esta planificación.'
        : 'No se pudo guardar la planificación. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async exportWeek(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set(false);
    const week = this.weekStart();
    try {
      const job = await firstValueFrom(this.jobs.exportWeek(week, this.boardId()));
      this.notice.set('Preparando el archivo Excel en segundo plano.');
      const result = await firstValueFrom(this.jobs.wait(job, 'export').pipe(takeUntilDestroyed(this.destroy)));
      if (result.status !== 'succeeded') { this.exportError.set(true); this.notice.set(''); return; }
      const blob = await firstValueFrom(this.jobs.exportFile(job.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Plan_semanal_' + week + '.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      this.notice.set('Archivo Excel preparado.');
    } catch {
      this.exportError.set(true);
      this.notice.set('');
    } finally {
      this.exporting.set(false);
    }
  }
}

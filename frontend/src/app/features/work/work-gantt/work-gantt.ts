import {HttpErrorResponse} from '@angular/common/http';
import {DOCUMENT} from '@angular/common';
import {ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Params, Router, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {MultiSelect} from 'primeng/multiselect';
import {Select} from 'primeng/select';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {GanttCandidate, GanttPlan, GanttPlanApi, GanttPlanDraft, GanttTaskChange} from '../../../core/services/gantt-plan-api.service';
import {GanttResponse, GanttTask, WorkApiService} from '../../../core/services/work-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkJobApi} from '../../../core/services/work-job-api.service';
import {PermissionsService} from '../../../core/services/permissions.service';
import {WorkIssueCreate} from '../work-issue-create/work-issue-create';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {debouncedAction} from '../../../core/timing/debounced-action';
import {WorkCard, WORK_STATUS_LABELS} from '../work.models';
import {GANTT_SCALES, GanttScale, countDays, dayLabel, dayNumber, estimatedEnd, isoDay, todayDay, weekend} from './gantt-calendar';

const ALL_PROJECTS = 'all';
const PROJECT_VIEW = 'projects';
const ROW_HEIGHT = 48;

type Range = {start: number; end: number};
type Bar = {left: number; width: number};
type Row = {task: GanttTask; depth: number; range: Range | null; bar: Bar | null; outside: 'left' | 'right' | null};
type Drag = {task: GanttTask; mode: 'move' | 'start' | 'end'; pointer: number; x: number; range: Range; pixels: number};
type LinkDrag = {id: string; pointer: number; x: number; y: number; moved: boolean};
type DependencyType = 'FINISH_TO_START' | 'START_TO_START';

@Component({
  selector: 'app-work-gantt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, Dialog, InputText, Select, MultiSelect, WorkIssueCreate, WorkPageHeader, WorkSkeleton],
  templateUrl: './work-gantt.html',
  styleUrl: './work-gantt.css',
})
export class WorkGantt {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly api = inject(WorkApiService);
  private readonly plansApi = inject(GanttPlanApi);
  private readonly jobs = inject(WorkJobApi);
  private readonly work = inject(WorkService);
  private readonly permissions = inject(PermissionsService);
  private readonly params = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});
  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  protected readonly issueCreate = viewChild(WorkIssueCreate);
  private readonly refresh = signal(0);
  private readonly destroy = inject(DestroyRef);
  private readonly searchDelay = debouncedAction(270);
  private readonly candidateDelay = debouncedAction(270);
  private request = 0;
  private candidatesRequest = 0;
  private drag: Drag | null = null;
  private linkDrag: LinkDrag | null = null;
  private suppressedLinkClick: string | null = null;
  private draggedItem: string | null = null;

  protected readonly demo = !environment.useApi;
  protected readonly plans = signal<GanttPlan[]>([]);
  protected readonly plansError = signal(false);
  protected readonly chart = signal<GanttResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly collapsed = signal(new Set<string>());
  protected readonly planId = computed(() => this.params().get('plan'));
  protected readonly projectId = computed(() => this.params().get('board') || ALL_PROJECTS);
  protected readonly scope = computed(() => this.planId() ? 'plan:' + this.planId() : 'project:' + this.projectId());
  protected readonly plan = computed(() => this.plans().find(plan => plan.id === this.planId()));
  protected readonly availableProjects = computed(() => this.work.standardBoards().map(project => ({label: project.name, value: project.id})));
  protected readonly projectOptions = computed(() => [{label: 'Todos los proyectos', value: ALL_PROJECTS}, ...this.availableProjects()]);
  protected readonly planOptions = computed(() => [{label: 'Fechas de los proyectos', value: PROJECT_VIEW},
    ...this.plans().map(plan => ({label: plan.name, value: plan.id}))]);
  protected readonly title = computed(() => this.plan()?.name ?? 'Diagramas de Gantt');
  protected readonly description = computed(() => {
    const plan = this.plan();
    if (plan) return plan.syncIssueDates ? 'Fechas y estimaciones sincronizadas con las incidencias.' : 'Fechas y estimaciones propias del diagrama.';
    return 'Planifica fechas y dependencias de los proyectos disponibles.';
  });
  protected readonly canRecalculate = computed(() => !this.demo && (this.planId() ? this.plan()?.editable
    : this.projectId() !== ALL_PROJECTS && this.permissions.isAdminOrChief()));
  protected readonly permittedProjectIds = computed(() => this.plan()?.projectIds
    ?? (this.projectId() === ALL_PROJECTS ? this.availableProjects().map(option => option.value) : [this.projectId()]));
  protected readonly canCreateIssue = computed(() => (!this.planId() || !!this.plan()?.editable) && !!this.permittedProjectIds().length);

  protected readonly scales = Object.entries(GANTT_SCALES) as [GanttScale, (typeof GANTT_SCALES)[GanttScale]][];
  protected readonly scale = computed<GanttScale>(() => {
    const value = this.params().get('scale');
    return value === 'day' || value === 'month' ? value : 'week';
  });
  protected readonly pixels = computed(() => GANTT_SCALES[this.scale()].pixels);
  protected readonly windowDays = computed(() => GANTT_SCALES[this.scale()].days);
  protected readonly timelineWidth = computed(() => this.pixels() * this.windowDays());
  protected readonly query = computed(() => this.params().get('q') ?? '');
  protected readonly anchor = computed(() => dayNumber(this.params().get('date'))
    ?? Math.min(dayNumber(this.chart()?.projectStart) ?? todayDay(), todayDay()));
  protected readonly displayedRange = computed(() => dayLabel(this.anchor(), {day: 'numeric', month: 'short'})
    + ' – ' + dayLabel(this.anchor() + this.windowDays() - 1, {day: 'numeric', month: 'short', year: 'numeric'}));
  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly labels = WORK_STATUS_LABELS;
  protected readonly sourceTypeOptions = [
    {label: 'Fin a inicio', value: 'FINISH_TO_START'}, {label: 'Inicio a inicio', value: 'START_TO_START'},
  ];
  protected readonly fullDays = computed(() => Array.from({length: this.windowDays()}, (_, i) => this.anchor() + i));
  protected readonly ticks = computed(() => this.fullDays().flatMap((day, index) => {
    const scale = this.scale();
    if (scale === 'month' && !isoDay(day).endsWith('-01') && index !== 0) return [];
    if (scale === 'week' && new Date(day * 86_400_000).getUTCDay() !== 1 && index !== 0) return [];
    return [{day, left: index * this.pixels(), label: dayLabel(day, scale === 'month' ? {month: 'short', year: '2-digit'}
      : scale === 'week' ? {day: 'numeric', month: 'short'} : {weekday: 'short', day: 'numeric'})}];
  }));
  protected readonly weekends = computed(() => this.fullDays().flatMap((day, index) => weekend(day) ? [index * this.pixels()] : []));
  protected readonly todayOffset = computed(() => this.offset(todayDay()));
  private readonly preview = signal<{id: string; range: Range} | null>(null);

  protected readonly tasks = computed(() => (this.chart()?.tasks ?? []).filter(task => !task.rowType || task.rowType === 'TASK'));
  private readonly tasksById = computed(() => new Map((this.chart()?.tasks ?? []).map(task => [task.id, task])));
  protected readonly selectionOptions = computed(() => this.tasks().map(task => ({label: task.key + ' · ' + task.title, value: task.id})));
  protected readonly rows = computed<Row[]>(() => {
    const all = this.chart()?.tasks ?? [];
    const text = this.normalize(this.query());
    const matched = new Set<string>();
    if (text) for (const task of this.tasks()) {
      if (!this.normalize([task.key, task.title, task.assigneeName, task.projectName].join(' ')).includes(text)) continue;
      for (let current: GanttTask | undefined = task; current && !matched.has(current.id); current = this.tasksById().get(current.parentId ?? '')) {
        matched.add(current.id);
      }
    }
    return all.flatMap(task => {
      if (text && !matched.has(task.id)) return [];
      let depth = 0;
      const seen = new Set<string>([task.id]);
      for (let parent = task.parentId; parent && !seen.has(parent); parent = this.tasksById().get(parent)?.parentId) {
        if (!text && this.collapsed().has(parent)) return [];
        seen.add(parent);
        depth++;
      }
      const preview = this.preview();
      const range = preview?.id === task.id ? preview.range : this.range(task);
      const bar = range ? this.bar(range) : null;
      const outside = range && !bar ? (range.end < this.anchor() ? 'left' : 'right') : null;
      return [{task, depth: Math.min(depth, 5), range, bar, outside}];
    });
  });

  private readonly vertical = signal({top: 0, height: 650});
  protected readonly rowWindow = computed(() => {
    const {top, height} = this.vertical();
    const from = Math.max(0, Math.min(this.rows().length, Math.floor(top / ROW_HEIGHT) - 8));
    const to = Math.min(this.rows().length, Math.ceil((top + height) / ROW_HEIGHT) + 8);
    return {first: from, last: Math.max(from, to), items: this.rows().slice(from, to)};
  });

  protected scrollRows(event: Event): void {
    const element = event.currentTarget as HTMLDivElement;
    const current = this.vertical();
    if (current.top !== element.scrollTop || current.height !== element.clientHeight) {
      this.vertical.set({top: element.scrollTop, height: element.clientHeight});
    }
  }

  protected readonly conflicts = computed(() => {
    const dates = new Map<number, string[]>();
    const people = new Map<string, string[]>();
    const issues = new Set<string>();
    const dependencies = new Set<string>();
    const plan = this.plan();
    for (const link of this.chart()?.links ?? []) {
      const source = this.tasksById().get(link.source);
      const target = this.tasksById().get(link.target);
      const before = source && this.range(source);
      const after = target && this.range(target);
      if (before && after && after.start < (link.type === 'START_TO_START' ? before.start : before.end + 1)) {
        dependencies.add(link.id);
        issues.add(link.target);
      }
    }
    let overCapacityDays = 0;
    let overAssigneeDays = 0;
    if (plan && (plan.capacity || plan.assigneeCapacity)) {
      for (const task of this.tasks()) {
        const interval = this.range(task);
        if (!interval || interval.end - interval.start > 3660) continue;
        for (let day = interval.start; day <= interval.end; day++) {
          if (plan.workdaysOnly && weekend(day)) continue;
          if (plan.capacity) this.occupy(dates, day, task.id);
          if (plan.assigneeCapacity && task.assigneeId) this.occupy(people, task.assigneeId + ':' + day, task.id);
        }
      }
      for (const ids of dates.values()) if (ids.length > plan.capacity!) {
        overCapacityDays++;
        ids.forEach(id => issues.add(id));
      }
      for (const ids of people.values()) if (ids.length > plan.assigneeCapacity!) {
        overAssigneeDays++;
        ids.forEach(id => issues.add(id));
      }
    }
    return {issues, dependencies, overCapacityDays, overAssigneeDays};
  });

  private readonly rowPositions = computed(() => new Map(this.rows().map((row, index) => [
    row.task.id, {row, y: index * ROW_HEIGHT + ROW_HEIGHT / 2},
  ])));

  protected readonly paths = computed(() => {
    const rows = this.rowPositions();
    const {first, last} = this.rowWindow();
    return (this.chart()?.links ?? []).flatMap(link => {
      const source = rows.get(link.source);
      const target = rows.get(link.target);
      if (!source?.row.bar || !target?.row.bar) return [];
      if (Math.max(source.y, target.y) < first * ROW_HEIGHT || Math.min(source.y, target.y) >= last * ROW_HEIGHT) return [];
      const x1 = source.row.bar.left + (link.type === 'START_TO_START' ? 0 : source.row.bar.width);
      const x2 = target.row.bar.left;
      const middle = x1 + Math.max(13, (x2 - x1) / 2);
      return [{id: link.id, broken: this.conflicts().dependencies.has(link.id),
        d: 'M ' + x1 + ' ' + source.y + ' C ' + middle + ' ' + source.y + ', ' + middle + ' ' + target.y + ', ' + x2 + ' ' + target.y}];
    });
  });

  protected readonly editor = signal<GanttTask | null>(null);
  private readonly newIssueDay = signal<number | undefined>(undefined);
  protected readonly taskDraft = signal<GanttTaskChange>({start: null, end: null, estimateMinutes: null, pinned: false});
  protected readonly editorError = signal('');
  protected readonly settingsOpen = signal(false);
  protected readonly editingPlan = signal<GanttPlan | null>(null);
  protected readonly deletingPlan = signal<GanttPlan | null>(null);
  protected readonly settingsError = signal('');
  protected readonly settingsDraft = signal<GanttPlanDraft>(this.emptyDraft());
  protected readonly pickerOpen = signal(false);
  protected readonly candidateQuery = signal('');
  protected readonly candidateDraft = signal('');
  protected readonly candidates = signal<GanttCandidate[]>([]);
  private readonly knownCandidates = signal(new Map<string, GanttCandidate>());
  protected readonly candidatesLoading = signal(false);
  protected readonly pickerError = signal('');
  protected readonly selectedItems = signal<string[]>([]);
  protected readonly pickerSelection = computed(() => {
    const byId = new Map<string, {key: string; title: string}>(this.tasks().map(task => [task.id, task]));
    for (const candidate of this.knownCandidates().values()) byId.set(candidate.id, candidate);
    return this.selectedItems().map(id => ({id, ...byId.get(id)}));
  });
  protected readonly dependencyOpen = signal(false);
  protected readonly dependencyError = signal('');
  protected readonly linkFrom = signal<string | null>(null);
  protected readonly draggingLink = signal(false);
  protected readonly linkTo = signal<string | null>(null);
  protected readonly linkType = signal<DependencyType>('FINISH_TO_START');
  protected readonly linkTargets = computed(() => {
    const source = this.tasksById().get(this.linkFrom() ?? '');
    return source ? this.selectionOptions().filter(option => this.canLinkTo(option.value)) : [];
  });

  constructor() {
    effect(() => {
      const planId = this.planId();
      const projectId = this.projectId();
      this.refresh();
      untracked(() => void this.loadChart(planId, projectId));
    });
    effect(() => {
      const id = this.pickerOpen() ? this.planId() : null;
      const query = this.candidateQuery();
      untracked(() => void this.loadCandidates(id, query));
    });
    void this.work.loadProjectIndex().catch(() => undefined);
    void this.loadPlans();
  }

  protected async loadPlans(): Promise<void> {
    if (this.demo) return;
    this.plansError.set(false);
    try { this.plans.set(await firstValueFrom(this.plansApi.list())); }
    catch { this.plansError.set(true); }
  }

  private async loadChart(planId: string | null, project: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.actionError.set('');
    this.notice.set('');
    this.collapsed.set(new Set());
    this.vertical.set({top: 0, height: 650});
    this.cancelLink();
    this.cancelDrag();
    try {
      const chart = this.demo ? this.localChart(project)
        : await firstValueFrom(planId ? this.plansApi.chart(planId) : this.api.gantt(project === ALL_PROJECTS ? undefined : project));
      if (request === this.request) {
        this.chart.set(chart);
        this.scrollToStart();
      }
    } catch {
      if (request === this.request) {
        this.chart.set(null);
        this.error.set('No se pudo abrir el diagrama. Comprueba el acceso o vuelve a intentarlo.');
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected retry(): void { this.refresh.update(value => value + 1); }
  protected selectPlan(id: string): void { this.setParams({plan: id === PROJECT_VIEW ? null : id, date: null, q: null}); }
  protected selectProject(id: string): void { this.setParams({board: id === ALL_PROJECTS ? null : id, date: null, q: null}); }
  protected search(q: string): void {
    this.searchDelay.schedule(() => {
      this.scroller()?.nativeElement.scrollTo({top: 0});
      this.setParams({q: q || null}, true);
    });
  }
  protected searchCandidates(query: string): void {
    this.candidateDraft.set(query);
    this.candidateDelay.schedule(() => this.candidateQuery.set(query));
  }
  protected setScale(scale: GanttScale): void { this.setParams({scale}, true); this.scrollToStart(); }
  protected shiftDate(direction: number): void { this.goDate(this.anchor() + direction * (this.windowDays() - 7)); }
  protected today(): void { this.goDate(todayDay() - 3); }
  protected fitStart(): void { this.goDate((dayNumber(this.chart()?.projectStart) ?? todayDay()) - 1); }
  protected goDate(day: number): void {
    const bounded = Math.max(dayNumber('1900-01-01')!, Math.min(dayNumber('2200-12-31')!, day));
    this.setParams({date: isoDay(bounded)}, true);
    this.scrollToStart();
  }
  protected toggle(id: string): void {
    this.collapsed.update(values => {
      const next = new Set(values);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected openSettings(plan?: GanttPlan): void {
    this.settingsError.set('');
    this.editingPlan.set(plan ?? null);
    this.settingsDraft.set(plan ? {...plan, projectIds: [...plan.projectIds]} : this.emptyDraft());
    this.settingsOpen.set(true);
  }

  protected changeSettings(change: Partial<GanttPlanDraft>): void {
    this.settingsDraft.update(draft => ({...draft, ...change}));
  }

  protected async saveSettings(): Promise<void> {
    const draft = this.settingsDraft();
    if (this.busy() || !draft.name.trim() || !draft.projectIds.length || !draft.startDate) return;
    this.busy.set(true);
    this.settingsError.set('');
    const previous = this.editingPlan();
    try {
      const plan = await firstValueFrom(this.plansApi.save(draft, previous?.id));
      this.plans.update(plans => [...plans.filter(entry => entry.id !== plan.id), plan].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      this.settingsOpen.set(false);
      if (this.planId() === plan.id) this.retry();
      else this.selectPlan(plan.id);
    } catch (error) {
      this.settingsError.set(this.message(error, 'No se pudo guardar el diagrama.'));
    } finally { this.busy.set(false); }
  }

  protected askDelete(plan: GanttPlan): void {
    this.settingsOpen.set(false);
    this.settingsError.set('');
    this.deletingPlan.set(plan);
  }

  protected async deletePlan(): Promise<void> {
    const plan = this.deletingPlan();
    if (!plan || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.plansApi.remove(plan.id));
      this.plans.update(plans => plans.filter(entry => entry.id !== plan.id));
      this.deletingPlan.set(null);
      if (this.planId() === plan.id) this.selectPlan(PROJECT_VIEW);
    } catch { this.settingsError.set('No se pudo eliminar el diagrama.'); }
    finally { this.busy.set(false); }
  }

  protected openPicker(): void {
    this.selectedItems.set(this.tasks().map(task => task.id));
    this.knownCandidates.set(new Map());
    this.candidates.set([]);
    this.candidateDelay.cancel();
    this.candidateDraft.set('');
    this.candidateQuery.set('');
    this.pickerOpen.set(true);
  }

  private async loadCandidates(id: string | null, query: string): Promise<void> {
    const request = ++this.candidatesRequest;
    this.pickerError.set('');
    this.candidatesLoading.set(!!id);
    if (!id) return;
    try {
      const candidates = await firstValueFrom(this.plansApi.candidates(id, query));
      if (request === this.candidatesRequest) {
        this.candidates.set(candidates);
        this.knownCandidates.update(known => new Map([...known, ...candidates.map(candidate => [candidate.id, candidate] as const)]));
      }
    } catch {
      if (request === this.candidatesRequest) this.pickerError.set('No se pudieron buscar las incidencias.');
    } finally {
      if (request === this.candidatesRequest) this.candidatesLoading.set(false);
    }
  }

  protected toggleCandidate(candidate: GanttCandidate): void {
    this.selectedItems.update(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id]);
  }

  protected removeItem(id: string): void { this.selectedItems.update(ids => ids.filter(value => value !== id)); }

  protected reorder(id: string, delta: number): void {
    this.selectedItems.update(ids => {
      const from = ids.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return ids;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  protected beginReorder(event: DragEvent, id: string): void {
    if (this.busy() || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    this.draggedItem = id;
  }

  protected allowReorder(event: DragEvent): void {
    if (this.draggedItem) event.preventDefault();
  }

  protected dropReorder(event: DragEvent, target: string): void {
    const source = this.draggedItem;
    this.draggedItem = null;
    if (!source || source === target) return;
    event.preventDefault();
    const order = this.selectedItems();
    this.reorder(source, order.indexOf(target) - order.indexOf(source));
  }

  protected endReorder(): void { this.draggedItem = null; }

  protected async saveSelection(): Promise<void> {
    const id = this.planId();
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.pickerError.set('');
    try {
      const chart = await firstValueFrom(this.plansApi.select(id, this.selectedItems()));
      if (this.planId() === id) this.chart.set(chart);
      this.pickerOpen.set(false);
    } catch (error) { this.pickerError.set(this.message(error, 'No se pudo guardar la selección de incidencias.')); }
    finally { this.busy.set(false); }
  }

  protected openNewIssue(day?: number): void {
    if (!this.canCreateIssue() || this.busy()) return;
    this.newIssueDay.set(day);
    const projects = this.permittedProjectIds();
    this.issueCreate()?.open(projects.length === 1 ? projects[0] : null);
  }

  protected createOnDate(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.openNewIssue(this.anchor() + Math.floor(event.offsetX / this.pixels()));
  }

  protected async issueCreated(issue: WorkCard): Promise<void> {
    const id = this.planId();
    this.busy.set(true);
    try {
      const chart = id
        ? await firstValueFrom(this.plansApi.add(id, issue.id))
        : this.demo ? this.localChart(this.projectId())
        : await firstValueFrom(this.api.gantt(this.projectId() === ALL_PROJECTS ? undefined : this.projectId()));
      this.chart.set(chart);
      const task = chart.tasks.find(task => task.id === issue.id);
      if (task) this.openEditor(task, this.newIssueDay());
    } catch {
      this.actionError.set(id ? 'La incidencia se creó. Puedes incorporarla desde Añadir incidencias.'
        : 'La incidencia se creó. Actualiza el diagrama para verla.');
    } finally { this.busy.set(false); }
  }

  protected openEditor(task: GanttTask, day?: number): void {
    if (!task.canEdit) return;
    const start = day ?? dayNumber(task.start);
    const end = day == null ? dayNumber(task.end) : estimatedEnd(day, task.estimateMinutes, !!this.plan()?.workdaysOnly);
    this.editor.set(task);
    this.editorError.set('');
    this.taskDraft.set({start: start == null ? null : isoDay(start), end: end == null ? null : isoDay(end),
      estimateMinutes: task.estimateMinutes ?? null, pinned: day != null || !!task.pinned});
  }

  protected changeDraft(change: Partial<GanttTaskChange>): void {
    this.taskDraft.update(draft => ({...draft, ...change}));
  }

  protected changeStart(value: string): void {
    const start = dayNumber(value);
    const end = dayNumber(this.taskDraft().end);
    this.changeDraft({start: start == null ? null : value, pinned: start != null,
      ...(start != null && (end == null || end < start) ? {end: isoDay(estimatedEnd(start, this.taskDraft().estimateMinutes, !!this.plan()?.workdaysOnly))} : {})});
  }

  protected changeEstimate(minutes: number | null): void {
    const start = dayNumber(this.taskDraft().start);
    const end = start != null && minutes != null && Number.isInteger(minutes) && minutes >= 0 && minutes <= 1_752_000
      ? isoDay(estimatedEnd(start, minutes, !!this.plan()?.workdaysOnly)) : undefined;
    this.changeDraft({estimateMinutes: minutes, ...(end ? {end} : {})});
  }

  protected async saveTask(clear = false): Promise<void> {
    const task = this.editor();
    if (!task || this.busy()) return;
    const change = clear ? {...this.taskDraft(), start: null, end: null, pinned: false} : this.taskDraft();
    const saved = await this.writeTask(task, change, true);
    if (saved) this.editor.set(null);
  }

  protected pickDate(event: MouseEvent, row: Row): void {
    if (!row.task.canEdit || event.target !== event.currentTarget) return;
    this.openEditor(row.task, this.anchor() + Math.floor(event.offsetX / this.pixels()));
  }

  protected beginDrag(event: PointerEvent, row: Row, mode: Drag['mode']): void {
    if (event.button !== 0 || this.busy() || this.linkFrom() || !row.range || !row.task.canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {task: row.task, mode, pointer: event.pointerId, x: event.clientX, range: row.range, pixels: this.pixels()};
  }

  @HostListener('document:pointermove', ['$event'])
  protected moving(event: PointerEvent): void {
    const link = this.linkDrag;
    if (link?.pointer === event.pointerId && !link.moved && Math.hypot(event.clientX - link.x, event.clientY - link.y) >= 6) {
      link.moved = true;
      this.draggingLink.set(true);
      this.startLink(link.id);
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    const days = Math.round((event.clientX - drag.x) / drag.pixels);
    const {start, end} = drag.range;
    const range = drag.mode === 'move' ? {start: start + days, end: end + days}
      : drag.mode === 'start' ? {start: Math.min(start + days, end), end}
      : {start, end: Math.max(end + days, start)};
    this.preview.set({id: drag.task.id, range});
  }

  @HostListener('document:pointerup', ['$event'])
  protected async finishDrag(event: PointerEvent): Promise<void> {
    const link = this.linkDrag;
    if (link?.pointer === event.pointerId) {
      this.linkDrag = null;
      if (link.moved) {
        this.suppressedLinkClick = link.id;
        setTimeout(() => { if (this.suppressedLinkClick === link.id) this.suppressedLinkClick = null; }, 0);
        const target = this.document.elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-gantt-task]')?.getAttribute('data-gantt-task');
        try {
          if (target && this.canLinkTo(target)) await this.addLink(target);
          else this.cancelLink();
        } finally { this.draggingLink.set(false); }
      }
      return;
    }
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const preview = this.preview();
    this.drag = null;
    if (!preview || (preview.range.start === drag.range.start && preview.range.end === drag.range.end)) {
      this.preview.set(null);
      return;
    }
    const {start, end} = preview.range;
    const estimate = drag.mode === 'move' ? drag.task.estimateMinutes ?? null
      : Math.max(1, countDays(start, end, !!this.plan()?.workdaysOnly)) * 480;
    try { await this.writeTask(drag.task, {start: isoDay(start), end: isoDay(end), estimateMinutes: estimate, pinned: true}, false); }
    finally { this.preview.set(null); }
  }

  @HostListener('document:pointercancel')
  protected cancelDrag(): void {
    if (this.linkDrag?.moved) this.cancelLink();
    this.linkDrag = null;
    this.draggingLink.set(false);
    this.drag = null;
    this.preview.set(null);
  }

  private async writeTask(task: GanttTask, change: GanttTaskChange, dialog: boolean): Promise<boolean> {
    const report = dialog ? this.editorError : this.actionError;
    report.set('');
    const start = dayNumber(change.start);
    const end = dayNumber(change.end);
    if (change.estimateMinutes != null && (!Number.isInteger(change.estimateMinutes)
      || change.estimateMinutes < 0 || change.estimateMinutes > 1_752_000)) {
      report.set('La estimación debe ser un número entero de minutos dentro del intervalo admitido.');
      return false;
    }
    if ((start == null) !== (end == null) || (start != null && end != null && (end < start || end - start > 3660))) {
      report.set('Indica un intervalo válido. El fin puede coincidir con el inicio.');
      return false;
    }
    if (this.busy()) return false;
    const id = this.planId();
    const scope = this.scope();
    this.busy.set(true);
    try {
      if (this.demo) {
        await this.work.updateCardAsync(task.id, {startDate: change.start ?? '', endDate: change.end ?? '', estimateMinutes: change.estimateMinutes});
        this.chart.set(this.localChart(this.projectId()));
      } else if (id) {
        const chart = await firstValueFrom(this.plansApi.updateTask(id, task.id, change));
        if (this.scope() === scope) this.chart.set(chart);
      } else {
        const updated = await firstValueFrom(this.api.updateGanttTaskDates(task.id, change));
        if (this.scope() === scope) {
          const project = this.projectId();
          try {
            const chart = await firstValueFrom(this.api.gantt(project === ALL_PROJECTS ? undefined : project));
            if (this.scope() === scope) this.chart.set(chart);
          } catch {
            if (this.scope() === scope) this.chart.update(chart => chart && ({...chart,
              tasks: chart.tasks.map(task => task.id === updated.id
                ? {...task, ...updated, parentId: task.parentId, hasChildren: task.hasChildren} : task),
            }));
          }
        }
      }
      if (this.scope() === scope) this.notice.set(change.start ? 'Planificación de ' + task.key + ' guardada.' : task.key + ' quedó sin planificar.');
      return true;
    } catch (error) {
      report.set(this.message(error, 'No se pudo guardar la planificación de la incidencia.'));
      return false;
    } finally { this.busy.set(false); }
  }

  protected async recalculate(): Promise<void> {
    if (!this.canRecalculate() || this.busy()) return;
    const id = this.planId();
    const scope = this.scope();
    this.busy.set(true);
    this.actionError.set('');
    try {
      const project = this.projectId();
      const job = await firstValueFrom(this.jobs.recalculate(id ? 'GANTT_PLAN' : 'GANTT_PROJECT', id ?? project));
      if (this.scope() === scope) this.notice.set('Recálculo en cola. Puedes seguir consultando el diagrama.');
      const result = await firstValueFrom(this.jobs.wait(job, 'gantt').pipe(takeUntilDestroyed(this.destroy)));
      if (result.status === 'failed') {
        if (this.scope() === scope) {
          this.notice.set('');
          this.actionError.set(result.failureStatus === 403 ? 'El recálculo requiere permisos de edición sobre las incidencias.'
            : 'El recálculo no pudo terminar. Revisa las fechas, la capacidad y las dependencias.');
        }
        return;
      }
      if (this.scope() !== scope) return;
      const chart = await firstValueFrom(id ? this.plansApi.chart(id) : this.api.gantt(project));
      if (this.scope() === scope) {
        this.chart.set(chart);
        this.notice.set('Cronograma recalculado. Se conservaron las fechas fijadas.');
      }
    } catch (error) { this.actionError.set(this.message(error, 'No se pudo recalcular el cronograma.')); }
    finally { this.busy.set(false); }
  }

  protected startLink(id: string): void {
    this.linkFrom.set(id);
    this.linkTo.set(null);
    this.linkType.set('FINISH_TO_START');
    this.dependencyError.set('');
  }

  protected cancelLink(): void { this.linkFrom.set(null); this.linkTo.set(null); }

  protected beginLinkDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0 || this.busy()) return;
    this.linkDrag = {id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected linkButton(id: string): void {
    if (this.suppressedLinkClick === id) {
      this.suppressedLinkClick = null;
      return;
    }
    this.startLink(id);
  }

  protected canLinkTo(id: string): boolean {
    const from = this.tasksById().get(this.linkFrom() ?? '');
    const target = this.tasksById().get(id);
    return !!from && !!target?.canEdit && from.id !== id && from.projectId === target.projectId;
  }

  protected async addLink(target = this.linkTo()): Promise<void> {
    const source = this.linkFrom();
    if (!source || !target || !this.canLinkTo(target) || this.busy()) return;
    this.busy.set(true);
    this.dependencyError.set('');
    this.actionError.set('');
    const scope = this.scope();
    try {
      const link = await firstValueFrom(this.api.addDependency(target, source, this.linkType()));
      if (scope === this.scope()) this.chart.update(chart => chart && ({...chart, links: [...chart.links, link]}));
      this.cancelLink();
      this.notice.set('Dependencia añadida.');
    } catch (error) {
      const message = this.message(error, 'No se pudo crear la dependencia.');
      (this.dependencyOpen() ? this.dependencyError : this.actionError).set(message);
    } finally { this.busy.set(false); }
  }

  protected async removeLink(id: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.dependencyError.set('');
    const scope = this.scope();
    try {
      await firstValueFrom(this.api.removeDependency(id));
      if (scope === this.scope()) this.chart.update(chart => chart && ({...chart, links: chart.links.filter(link => link.id !== id)}));
    } catch (error) { this.dependencyError.set(this.message(error, 'No se pudo retirar la dependencia.')); }
    finally { this.busy.set(false); }
  }

  protected taskFor(id: string): GanttTask | undefined { return this.tasksById().get(id); }
  protected dateLabel(value: string | null | undefined): string {
    const day = dayNumber(value);
    return day == null ? '' : dayLabel(day, {day: 'numeric', month: 'short'});
  }

  protected dueOffset(task: GanttTask): number | null { return this.offset(dayNumber(task.dueDate)); }

  protected estimateLabel(minutes: number | null | undefined): string {
    if (minutes == null) return 'Sin estimación';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours && rest ? hours + ' h ' + rest + ' min' : hours ? hours + ' h' : rest + ' min';
  }

  protected tone(task: GanttTask): string {
    if (task.rowType && task.rowType !== 'TASK') return 'group';
    if (task.columnId === 'done' || task.columnId === 'closed') return 'resolved';
    return task.estimateMinutes != null && (task.trackedMinutes ?? 0) > task.estimateMinutes ? 'late' : 'open';
  }

  protected taskPageContext() { return {returnTo: this.router.url}; }

  protected offset(day: number | null): number | null {
    if (day == null) return null;
    const index = day - this.anchor();
    return index < 0 || index >= this.windowDays() ? null : (index + .5) * this.pixels();
  }

  private range(task: GanttTask): Range | null {
    const start = dayNumber(task.start);
    const end = dayNumber(task.end);
    return start == null || end == null || end < start ? null : {start, end};
  }

  private bar(range: Range): Bar | null {
    const offset = this.anchor();
    const start = Math.max(range.start, offset);
    const end = Math.min(range.end, offset + this.windowDays() - 1);
    return end < start ? null : {left: (start - offset) * this.pixels() + 1, width: (end - start + 1) * this.pixels() - 2};
  }

  private occupy<K>(map: Map<K, string[]>, key: K, id: string): void {
    const values = map.get(key);
    if (values) values.push(id);
    else map.set(key, [id]);
  }

  private emptyDraft(): GanttPlanDraft {
    return {name: '', projectIds: [], startDate: isoDay(todayDay()), capacity: null, assigneeCapacity: null,
      workdaysOnly: true, syncIssueDates: false, shared: false};
  }

  private localChart(project: string): GanttResponse {
    const cards = this.work.cards().filter(card => project === ALL_PROJECTS ? this.permittedProjectIds().includes(card.boardId) : card.boardId === project);
    return {projectStart: isoDay(todayDay()), links: [], tasks: cards.map(card => ({id: card.id, key: this.work.getIssueKey(card),
      title: card.title, start: card.startDate || null, end: card.endDate || null, dueDate: card.dueDate, columnId: card.columnId,
      assigneeName: this.work.getMember(card.assigneeId)?.name ?? null, assigneeId: card.assigneeId, progress: 0,
      projectName: this.work.getBoard(card.boardId)?.name, projectId: card.boardId, estimateMinutes: card.estimateMinutes,
      trackedMinutes: card.trackedMinutes, canEdit: true, parentId: card.parentIssueId ?? null, hasChildren: cards.some(child => child.parentIssueId === card.id),
    }))};
  }

  private scrollToStart(): void { this.scroller()?.nativeElement.scrollTo({left: 0}); }
  private setParams(queryParams: Params, replaceUrl = false): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl});
  }

  private normalize(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim(); }

  private message(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;
    if (error.status === 403) return 'No tienes permiso para realizar este cambio.';
    if (typeof error.error?.message === 'string' && error.error.message.trim()) return error.error.message;
    if (error.status === 409) return 'Los datos cambiaron o el vínculo ya existe. Actualiza el diagrama.';
    if (error.status === 422) return 'El cambio no cumple las reglas del diagrama. Revisa las fechas y dependencias.';
    return fallback;
  }
}

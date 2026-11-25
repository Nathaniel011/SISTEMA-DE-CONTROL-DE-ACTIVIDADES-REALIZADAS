import {ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Params, Router, RouterLink} from '@angular/router';
import {Avatar} from 'primeng/avatar';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Paginator, PaginatorState} from 'primeng/paginator';
import {Select} from 'primeng/select';
import {MultiSelect} from 'primeng/multiselect';
import {firstValueFrom, Subject, takeUntil} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../core/services/auth.service';
import {IssuePageQuery, IssuePageResult, WorkApiService} from '../../../core/services/work-api.service';
import {debouncedAction} from '../../../core/timing/debounced-action';
import {AgileBoard, AgileBoardApi} from '../../../core/services/agile-board-api.service';
import {WorkIssueFilter, WorkService} from '../../../core/services/work.service';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkIssueCreate} from '../work-issue-create/work-issue-create';
import {WorkIssueCalendar} from '../work-issue-calendar/work-issue-calendar';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {WorkKanbanCard} from '../work-kanban-card/work-kanban-card';
import {WORK_COLUMNS, WORK_PRIORITIES, WORK_STATUS_LABELS, WorkCard, WorkColumnId} from '../work.models';
import {boardDisplayName, formatWorkDate, formatWorkDateISO, isOverdue, priorityMeta} from '../work.utils';
import {matchesIssueQuery, parseIssueQuery} from './work-issue-query';

type IssueScope = Extract<WorkIssueFilter, 'all' | 'assigned' | 'unassigned'> | 'overdue';

const PAGE_SIZE = 10;
const VIEW_KEYS = ['view', 'q', 'board', 'boards', 'status', 'scope', 'activity', 'member', 'priority', 'sort', 'group', 'createdFrom', 'createdTo', 'month'] as const;
type SavedView = {id?: string; name: string; filters: Record<string, string>};
const SCOPES: {value: IssueScope; label: string; icon: string}[] = [
  {value: 'all', label: 'Todas', icon: 'pi-list'},
  {value: 'assigned', label: 'Asignadas a mí', icon: 'pi-user'},
  {value: 'overdue', label: 'Vencidas', icon: 'pi-clock'},
  {value: 'unassigned', label: 'Sin asignar', icon: 'pi-user-minus'},
];

@Component({
  selector: 'app-work-issues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, Avatar, Button, Dialog, IconField, InputIcon, InputText,
    Paginator, Select, MultiSelect, WorkCardDrawer, WorkIssueCreate, WorkIssueCalendar, WorkPageHeader, WorkSkeleton, WorkKanbanCard,
  ],
  templateUrl: './work-issues.html',
  styleUrl: './work-issues.css',
})
export class WorkIssues {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(WorkApiService);
  private readonly agileApi = inject(AgileBoardApi);
  private readonly abortPage = new Subject<void>();
  private readonly searchDelay = debouncedAction(270);
  private loadRun = 0;
  protected readonly work = inject(WorkService);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly demo = !environment.useApi;
  protected readonly boardSurface = this.route.snapshot.data['surface'] === 'board';
  private readonly routeParams = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  protected readonly configuredId = computed(() => this.routeParams().get('viewId'));
  protected readonly configured = signal<AgileBoard | null>(null);
  private readonly scopedIds = computed(() => this.configuredId() ? this.configured()?.projectIds ?? [] : null);
  private readonly scopedProjects = computed(() => {
    const ids = this.scopedIds();
    return this.work.boards().filter(project => ids === null || ids.includes(project.id));
  });
  protected readonly allowedProjectIds = computed(() => this.scopedIds() ?? null);
  protected readonly projectLabel = (id: string) => this.work.getBoard(id)?.name ?? 'Proyecto';
  protected readonly description = computed(() => {
    if (!this.boardSurface) return 'Busca y consulta el trabajo de tus proyectos.';
    if (!this.configuredId()) return 'Organiza por estado las incidencias de los proyectos a los que tienes acceso.';
    return this.scopedProjects().map(project => project.name).join(' · ') || 'Sin proyectos disponibles';
  });
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly moveError = signal('');
  protected readonly announcement = signal('');
  protected readonly moving = signal(false);
  protected readonly moveIssueId = signal<string | null>(null);
  protected readonly moveTarget = signal<WorkColumnId | null>(null);
  protected readonly dragged = signal<WorkCard | null>(null);
  protected readonly dropTarget = signal<WorkColumnId | null>(null);
  protected readonly moreFiltersOpen = signal(false);
  protected readonly viewsOpen = signal(false);
  protected readonly viewName = signal('');
  protected readonly viewError = signal('');
  protected readonly viewsBusy = signal(false);
  protected readonly savedViews = signal<SavedView[]>(this.readSavedViews());

  protected readonly pageSize = PAGE_SIZE;
  protected readonly scopes = SCOPES;
  protected readonly labels = WORK_STATUS_LABELS;
  protected readonly formatDate = formatWorkDate;
  protected readonly priorityMeta = priorityMeta;
  protected readonly statusOptions = [
    {label: 'Todos los estados', value: null},
    ...WORK_COLUMNS.map(({id}) => ({label: WORK_STATUS_LABELS[id], value: id})),
  ];
  protected readonly sortOptions = [
    {label: 'Más recientes', value: 'recent'},
    {label: 'Vencimiento', value: 'due'},
    {label: 'Identificador', value: 'key'},
  ];
  protected readonly activityOptions = [
    {label: 'Toda la actividad', value: null},
    {label: 'Comentadas por mí', value: 'commented'},
    {label: 'Me mencionan', value: 'mentioned'},
  ];
  protected readonly priorityOptions = [
    {label: 'Cualquier prioridad', value: null},
    ...WORK_PRIORITIES.filter(priority => priority.value !== 'low').map(({value, label}) => ({value, label})),
  ];
  protected readonly memberOptions = computed(() => [
    {label: 'Cualquier responsable', value: null},
    ...this.work.members().map(member => ({label: member.name, value: member.id})),
  ]);

  protected readonly view = computed(() => {
    if (this.boardSurface) return 'board';
    return this.params().get('view') === 'calendar' ? 'calendar' : 'list';
  });
  protected readonly month = computed(() => {
    const value = this.params().get('month') ?? '';
    return /^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(value) ? value : formatWorkDateISO(new Date()).slice(0, 7);
  });
  protected readonly query = computed(() => this.params().get('q') ?? '');
  protected readonly searchDraft = signal(this.query());
  protected readonly pendingSearchParams = computed<Params>(() =>
    this.searchDraft() === this.query() ? {} : {q: this.searchDraft() || null, page: null}
  );
  private readonly parsedQuery = computed(() => parseIssueQuery(this.query()));
  protected readonly queryIncomplete = computed(() => this.parsedQuery().incomplete);
  protected issuePageContext() {
    const context = this.router.createUrlTree([], {relativeTo: this.route, queryParamsHandling: 'merge',
      queryParams: {...this.pendingSearchParams(), issue: null}});
    return {returnTo: this.router.serializeUrl(context)};
  }
  protected readonly board = computed(() => this.params().get('board'));
  protected readonly selectedBoards = computed(() => (this.params().get('boards') ?? '').split(',').filter(Boolean));
  protected readonly projectOptions = computed(() => this.scopedProjects().map(board => ({label: boardDisplayName(board), value: board.id})));
  protected readonly transitionParams = computed<Params>(() => {
    const query: Params = {};
    for (const key of VIEW_KEYS) {
      if (key === 'view' || key === 'month') continue;
      const value = this.params().get(key);
      if (value) query[key] = value;
    }
    if (this.boardSurface) {
      query['view'] = 'list';
      const ids = this.scopedIds();
      if (ids) {
        const selected = this.selectedBoards();
        query['boards'] = ids.filter(id => (!selected.length || selected.includes(id)) && (!this.board() || this.board() === id)).join(',') || 'unavailable';
        delete query['board'];
      }
    }
    return query;
  });
  protected readonly quickIssueId = signal<string | null>(null);
  protected readonly quickDue = signal('');
  protected readonly quickAssignee = signal<string | null>(null);
  protected readonly quickSaving = signal(false);
  protected readonly quickError = signal('');
  protected readonly quickCard = computed(() => this.work.getCard(this.quickIssueId() ?? ''));
  protected readonly quickMembers = computed(() => {
    const card = this.quickCard();
    const members = card && this.work.getBoard(card.boardId)?.memberIds;
    return [{label: 'Sin asignar', value: null}, ...this.work.assignableMembers().filter(user => members?.includes(user.id))
      .map(user => ({label: user.name, value: user.id}))];
  });
  protected readonly member = computed(() => this.params().get('member'));
  protected readonly priority = computed(() => this.params().get('priority'));
  protected readonly createdFrom = computed(() => this.params().get('createdFrom'));
  protected readonly createdTo = computed(() => this.params().get('createdTo'));
  protected readonly group = computed(() => {
    const group = this.params().get('group');
    return group === 'open' || group === 'progress' || group === 'closed' ? group : null;
  });
  protected readonly status = computed(() => {
    const value = this.params().get('status');
    return WORK_COLUMNS.find(column => column.id === value)?.id ?? null;
  });
  protected readonly scope = computed<IssueScope>(() =>
    SCOPES.find(scope => scope.value === this.params().get('scope'))?.value ?? 'all',
  );
  protected readonly activity = computed(() => {
    const value = this.params().get('activity');
    return value === 'commented' || value === 'mentioned' ? value : null;
  });
  protected readonly sort = computed(() => {
    const value = this.params().get('sort');
    return value === 'due' || value === 'key' ? value : 'recent';
  });
  protected readonly issueId = computed(() => this.params().get('issue'));
  private readonly openedOnServer = signal<string | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly openCard = computed(() => {
    if (this.loading() || this.loadError()) return undefined;
    if (this.remoteList() && this.openedOnServer() !== this.issueId()) return undefined;
    const card = this.work.getCard(this.issueId() ?? '');
    return card && this.inBoardScope(card) ? card : undefined;
  });

  protected readonly boardOptions = computed(() => [
    {label: 'Todos los proyectos', value: null},
    ...this.projectOptions(),
  ]);
  protected readonly hasFilters = computed(() =>
    !!(this.query() || this.board() || this.selectedBoards().length || this.status() || this.activity() || this.member()
      || this.priority() || this.group() || this.createdFrom() || this.createdTo() || this.scope() !== 'all'),
  );

  private readonly baseResults = computed(() =>
    this.work.filterIssues(
      this.work.cards(), this.activity() ?? 'all', this.board() ?? 'all', this.parsedQuery().text,
    ).filter(card =>
      this.inBoardScope(card)
      && this.matchesQuery(card)
      && (!this.selectedBoards().length || this.selectedBoards().includes(card.boardId))
      && (!this.status() || card.columnId === this.status())
      && (!this.member() || card.assigneeId === this.member())
      && (!this.priority() || card.priority === this.priority() || (this.priority() === 'medium' && card.priority === 'low'))
      && (this.group() !== 'open' || (card.columnId !== 'done' && card.columnId !== 'closed'))
      && (this.group() !== 'closed' || card.columnId === 'done' || card.columnId === 'closed')
      && (this.group() !== 'progress' || card.columnId === 'in_progress' || card.columnId === 'review')
      && (!this.createdFrom() || card.createdAt.slice(0, 10) >= this.createdFrom()!)
      && (!this.createdTo() || card.createdAt.slice(0, 10) <= this.createdTo()!),
    ),
  );

  private readonly remoteList = computed(() => !this.demo && this.view() === 'list');
  private readonly remotePage = signal<IssuePageResult | null>(null);
  private readonly remoteQuery = computed(() => JSON.stringify(this.pageQuery()));

  protected readonly scopeCounts = computed(() => {
    if (this.remoteList()) return this.remotePage()?.counts ?? {all: 0, assigned: 0, overdue: 0, unassigned: 0};
    const counts = {all: 0, assigned: 0, overdue: 0, unassigned: 0};
    const member = this.work.currentMemberId();
    for (const card of this.baseResults()) {
      counts.all++;
      if (member && card.assigneeId === member) counts.assigned++;
      if (this.overdue(card)) counts.overdue++;
      if (!card.assigneeId) counts.unassigned++;
    }
    return counts;
  });

  protected readonly results = computed(() => {
    const scope = this.scope();
    const member = this.work.currentMemberId();
    const sort = this.sort();
    return this.baseResults()
      .filter(card => {
        switch (scope) {
          case 'assigned': return !!member && card.assigneeId === member;
          case 'overdue': return this.overdue(card);
          case 'unassigned': return !card.assigneeId;
          default: return true;
        }
      })
      .sort((a, b) => {
        const byKey = this.work.getIssueKey(a).localeCompare(this.work.getIssueKey(b), 'es', {numeric: true});
        if (sort === 'key') return byKey;
        if (sort === 'due') return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || byKey;
        return b.updatedAt.localeCompare(a.updatedAt) || byKey;
      });
  });

  protected readonly destinations = computed(() => new Map(
    (this.remoteList() ? this.pageCards() : this.results())
      .map(card => [card.id, this.work.getIssueDestinations(card, this.remoteList() ? this.editable(card) : undefined)]),
  ));

  protected readonly columns = computed(() => {
    const grouped = new Map<WorkColumnId, WorkCard[]>(WORK_COLUMNS.map(column => [column.id, []]));
    const activeDestinations = new Set<WorkColumnId>();
    for (const card of this.results()) {
      grouped.get(card.columnId)?.push(card);
      this.destinations().get(card.id)?.forEach((_, status) => activeDestinations.add(status));
    }
    return WORK_COLUMNS.filter(column => {
      if (this.status()) return column.id === this.status();
      return grouped.get(column.id)?.length || activeDestinations.has(column.id);
    }).map(column => ({...column, cards: grouped.get(column.id) ?? []}));
  });

  protected readonly page = computed(() => {
    if (this.remoteList()) return this.remotePage()?.page ?? 1;
    const requested = Number(this.params().get('page'));
    const total = Math.max(1, Math.ceil(this.results().length / PAGE_SIZE));
    return Number.isSafeInteger(requested) ? Math.min(total, Math.max(1, requested)) : 1;
  });
  protected readonly first = computed(() => (this.page() - 1) * PAGE_SIZE);
  protected readonly resultTotal = computed(() => this.remoteList() ? this.remotePage()?.total ?? 0 : this.results().length);
  protected readonly pageCards = computed<WorkCard[]>(() => this.remoteList()
    ? (this.remotePage()?.items ?? []).map(row => ({
        ...row, description: '', createdAt: '', estimateMinutes: null, trackedMinutes: 0, order: 0,
        attachments: [], comments: [], timeEntries: [],
      }))
    : this.results().slice(this.first(), this.first() + PAGE_SIZE));
  protected readonly moveCard = computed(() => this.work.getCard(this.moveIssueId() ?? ''));
  protected readonly moveOptions = computed(() => {
    const card = this.moveCard();
    if (!card) return [];
    const destinations = this.work.getIssueDestinations(card);
    return WORK_COLUMNS.filter(({id}) => destinations.has(id))
      .map(({id}) => ({label: WORK_STATUS_LABELS[id], value: id}));
  });

  constructor() {
    if (!this.boardSurface && this.params().get('view') === 'board') {
      void this.router.navigate(['/work/agile/vista'], {
        queryParams: {...this.route.snapshot.queryParams, view: null}, replaceUrl: true,
      });
      return;
    }
    inject(DestroyRef).onDestroy(() => { this.loadRun++; this.abortPage.next(); this.abortPage.complete(); });
    effect(() => {
      const query = this.query();
      untracked(() => { this.searchDelay.cancel(); this.searchDraft.set(query); });
    });
    effect(() => {
      this.configuredId();
      if (this.remoteList()) this.remoteQuery();
      untracked(() => void this.load(false));
    });
    effect(onCleanup => {
      const id = this.remoteList() ? this.issueId() : null;
      this.openedOnServer.set(null);
      if (!id) {
        this.detailLoading.set(false);
        return;
      }
      this.detailLoading.set(true);
      let current = true;
      onCleanup(() => { current = false; });
      untracked(() => void this.work.loadIssue(id).then(card => {
        if (current && card) this.openedOnServer.set(card.id);
      }).catch(() => undefined).finally(() => {
        if (current) this.detailLoading.set(false);
      }));
    });
  }

  protected async load(refresh = true): Promise<void> {
    const run = ++this.loadRun;
    this.abortPage.next();
    const id = this.configuredId();
    this.loading.set(true);
    this.loadError.set(false);
    if (this.remoteList()) {
      try {
        const query: IssuePageQuery = JSON.parse(this.remoteQuery());
        const pageRequest = this.queryIncomplete()
          ? Promise.resolve({items: [], counts: {all: 0, assigned: 0, unassigned: 0, overdue: 0}, total: 0, page: 1})
          : firstValueFrom(this.api.searchIssues(query).pipe(takeUntil(this.abortPage)));
        const [page] = await Promise.all([pageRequest, this.work.loadProjectIndex()]);
        if (run === this.loadRun) this.remotePage.set(page);
      } catch {
        if (run === this.loadRun) this.loadError.set(true);
      } finally {
        if (run === this.loadRun) this.loading.set(false);
      }
      return;
    }
    this.configured.set(null);
    try {
      const [board] = await Promise.all([
        id ? firstValueFrom(this.agileApi.get(id)) : Promise.resolve(null), this.work.ensureAllCards(refresh),
      ]);
      if (run === this.loadRun) this.configured.set(board);
    } catch {
      if (run === this.loadRun) this.loadError.set(true);
    } finally {
      if (run === this.loadRun) this.loading.set(false);
    }
  }

  private pageQuery(): IssuePageQuery {
    const page = Number(this.params().get('page')) || 1;
    const uuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
    const board = this.board();
    const selected = this.selectedBoards();
    const projects = board || selected.length ? (board ? [board] : selected)
      .filter(id => uuid(id) && (!selected.length || selected.includes(id))) : null;
    const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    return {
      page: Math.min(100000, Math.max(1, Math.trunc(page))), size: PAGE_SIZE,
      text: this.parsedQuery().text.slice(0, 500), terms: this.parsedQuery().terms.slice(0, 30)
        .map(term => ({...term, value: term.value.slice(0, 300)})),
      projects: projects?.slice(0, 80) ?? null,
      member: this.member() && uuid(this.member()!) ? this.member() : null,
      status: this.status(), priority: this.priority()?.slice(0, 20) ?? null, group: this.group(),
      activity: this.activity(), scope: this.scope(), sort: this.sort(),
      createdFrom: date(this.createdFrom()), createdTo: date(this.createdTo()), today: formatWorkDateISO(new Date()),
    };
  }

  protected updateSearch(value: string): void {
    this.searchDraft.set(value);
    this.searchDelay.schedule(() => this.filter({q: value || null}, true));
  }

  protected openCreated(id: string): void {
    this.updateUrl({issue: id});
    if (this.remoteList()) void this.load();
  }

  protected editable(card: WorkCard): boolean {
    return this.remoteList() ? !!this.remotePage()?.items.find(row => row.id === card.id)?.canEdit : this.work.canEditCard(card);
  }

  private inBoardScope(card: WorkCard): boolean {
    const ids = this.scopedIds();
    return ids === null || ids.includes(card.boardId);
  }

  private matchesQuery(card: WorkCard): boolean {
    const query = this.parsedQuery();
    if (!query.incomplete && !query.terms.length) return true;
    const project = this.work.getBoard(card.boardId);
    return matchesIssueQuery(query, card, {
      projectKey: project?.key ?? '',
      projectName: project ? boardDisplayName(project) : '',
      key: this.work.getIssueKey(card),
      assignee: this.work.getMember(card.assigneeId)?.name ?? '',
      currentUserId: this.work.currentMemberId() ?? null,
    });
  }

  protected filter(params: Params, replaceUrl = false): void {
    this.updateUrl({...params, page: null}, replaceUrl);
  }

  protected clearFilters(): void {
    this.searchDelay.cancel();
    this.searchDraft.set('');
    this.filter({q: null, board: null, boards: null, status: null, scope: null, activity: null, member: null, priority: null,
      group: null, createdFrom: null, createdTo: null});
  }

  protected openViews(): void {
    this.viewError.set('');
    this.viewName.set('');
    this.viewsOpen.set(true);
    if (!this.demo) void this.syncViews();
  }

  private async syncViews(): Promise<void> {
    if (this.viewsBusy()) return;
    this.viewsBusy.set(true);
    try {
      const remote: SavedView[] = await firstValueFrom(this.api.getIssueViews());
      const local = this.readSavedViews();
      const remaining: SavedView[] = [];
      for (const view of local) {
        if (remote.some(existing => existing.name.toLowerCase() === view.name.toLowerCase())) continue;
        const filters = Object.fromEntries(Object.entries(view.filters).filter(([key, value]) =>
          (VIEW_KEYS as readonly string[]).includes(key) && value.length <= 4000));
        try {
          remote.push(await firstValueFrom(this.api.saveIssueView({name: view.name.slice(0, 48), filters})));
        } catch {
          remaining.push(view);
        }
      }
      this.persistViews(remaining);
      this.savedViews.set([...remote, ...remaining]);
      if (remaining.length) this.viewError.set('Algunas vistas anteriores siguen guardadas en este navegador.');
    } catch {
      this.viewError.set('No se pudieron sincronizar tus vistas. Vuelve a abrir este panel para reintentar.');
    } finally {
      this.viewsBusy.set(false);
    }
  }

  protected async saveView(): Promise<void> {
    const name = this.viewName().trim();
    if (!name || this.viewsBusy()) return;
    const existing = this.savedViews();
    if (existing.some(view => view.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      this.viewError.set('Ya existe una vista con ese nombre.');
      return;
    }
    if (existing.length >= 20) {
      this.viewError.set('Puedes guardar hasta 20 vistas.');
      return;
    }
    const filters: SavedView['filters'] = {};
    for (const key of VIEW_KEYS) {
      const value = this.params().get(key);
      if (value) filters[key] = value;
    }
    if (this.demo) {
      if (this.persistViews([...existing, {name, filters}])) this.viewName.set('');
      return;
    }
    this.viewsBusy.set(true);
    this.viewError.set('');
    try {
      const saved = await firstValueFrom(this.api.saveIssueView({name, filters}));
      this.savedViews.update(views => [...views, saved]);
      this.viewName.set('');
    } catch {
      this.viewError.set('No se pudo guardar la vista en tu cuenta. Comprueba el nombre y vuelve a intentarlo.');
    } finally {
      this.viewsBusy.set(false);
    }
  }

  protected restoreView(view: SavedView): void {
    const filters: Params = {page: null, issue: null};
    for (const key of VIEW_KEYS) filters[key] = view.filters[key] ?? null;
    if (filters['view'] === 'board') {
      delete filters['view'];
      void this.router.navigate(['/work/agile/vista'], {queryParams: filters});
    } else {
      this.updateUrl(filters);
    }
    this.viewsOpen.set(false);
  }

  protected async copyView(view: SavedView): Promise<void> {
    const queryParams: Params = {};
    for (const key of VIEW_KEYS) {
      if (view.filters[key]) queryParams[key] = view.filters[key];
    }
    const board = queryParams['view'] === 'board';
    if (board) delete queryParams['view'];
    const tree = this.router.createUrlTree([board ? '/work/agile/vista' : '/work/issues'], {queryParams});
    try {
      await navigator.clipboard.writeText(new URL(this.router.serializeUrl(tree), document.baseURI).href);
      this.viewError.set('');
      this.announcement.set('Enlace de vista copiado.');
    } catch {
      this.viewError.set('No se pudo copiar el enlace. Puedes abrir la vista y copiar su dirección.');
    }
  }

  protected async deleteView(view: SavedView): Promise<void> {
    if (this.viewsBusy()) return;
    const remaining = this.savedViews().filter(saved => saved !== view);
    if (!view.id) {
      if (this.persistViews(remaining.filter(saved => !saved.id))) this.savedViews.set(remaining);
      return;
    }
    this.viewsBusy.set(true);
    this.viewError.set('');
    try {
      await firstValueFrom(this.api.deleteIssueView(view.id));
      this.savedViews.set(remaining);
    } catch {
      this.viewError.set('No se pudo eliminar la vista.');
    } finally {
      this.viewsBusy.set(false);
    }
  }

  private storageKey(): string {
    return 'scar-issue-views:' + (this.auth.currentUser()?.id ?? '');
  }

  private readSavedViews(): SavedView[] {
    try {
      const decoded: unknown = JSON.parse(localStorage.getItem(this.storageKey()) ?? '[]');
      if (!Array.isArray(decoded)) return [];
      return decoded.filter((view): view is SavedView => typeof view?.name === 'string' &&
        typeof view.filters === 'object' && view.filters !== null &&
        Object.values(view.filters).every(value => typeof value === 'string'));
    } catch {
      return [];
    }
  }

  private persistViews(views: SavedView[]): boolean {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(views));
      this.savedViews.set(views);
      this.viewError.set('');
      return true;
    } catch {
      this.viewError.set('No se pudieron guardar las vistas en este navegador.');
      return false;
    }
  }

  protected changePage(event: PaginatorState): void {
    const page = (event.page ?? 0) + 1;
    this.updateUrl({page: page > 1 ? page : null});
  }

  protected closeIssue(): void {
    this.updateUrl({issue: null}, true);
  }

  protected openQuickEdit(card: WorkCard): void {
    if (this.remoteList()) this.work.seedIssueSummary(card, this.editable(card));
    this.quickDue.set(card.dueDate ?? '');
    this.quickAssignee.set(card.assigneeId);
    this.quickError.set('');
    this.quickIssueId.set(card.id);
  }

  protected closeQuickEdit(): void {
    if (!this.quickSaving()) this.quickIssueId.set(null);
  }

  protected async saveQuickEdit(): Promise<void> {
    const card = this.quickCard();
    if (!card || this.quickSaving()) return;
    const dueDate = this.quickDue() || null;
    const assigneeId = this.quickAssignee();
    const patch: Partial<WorkCard> = {};
    if (dueDate !== card.dueDate) patch.dueDate = dueDate;
    if (this.work.canAssignTasks() && assigneeId !== card.assigneeId) patch.assigneeId = assigneeId;
    if (!Object.keys(patch).length) { this.closeQuickEdit(); return; }
    this.quickSaving.set(true);
    this.quickError.set('');
    try {
      await this.work.updateCardAsync(card.id, patch);
      this.quickIssueId.set(null);
      this.announcement.set(`${this.work.getIssueKey(card)} actualizada.`);
      if (this.remoteList()) await this.load();
    } catch {
      this.quickError.set('No se pudieron guardar los cambios. Conservamos tus datos.');
    } finally {
      this.quickSaving.set(false);
    }
  }

  protected overdue(card: WorkCard): boolean {
    return card.columnId !== 'done' && card.columnId !== 'closed' && isOverdue(card.dueDate);
  }

  protected canMove(card: WorkCard): boolean {
    return !!this.destinations().get(card.id)?.size;
  }

  protected startDrag(event: DragEvent, card: WorkCard): void {
    if (!event.dataTransfer || this.moving() || !this.canMove(card)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.work.getIssueKey(card));
    this.dragged.set(card);
  }

  protected endDrag(): void {
    this.dragged.set(null);
    this.dropTarget.set(null);
  }

  protected allowDrop(event: DragEvent, status: WorkColumnId): void {
    if (!this.isDropDestination(status)) return;
    event.preventDefault();
    this.dropTarget.set(status);
  }

  protected isDropDestination(status: WorkColumnId): boolean {
    const card = this.dragged();
    return !!card && !!this.destinations().get(card.id)?.has(status);
  }

  protected drop(event: DragEvent, status: WorkColumnId): void {
    event.preventDefault();
    const card = this.dragged();
    const allowed = this.isDropDestination(status);
    this.endDrag();
    if (card && allowed) void this.move(card, status);
  }

  protected openMove(card: WorkCard): void {
    if (this.remoteList()) this.work.seedIssueSummary(card, this.editable(card));
    this.moveError.set('');
    this.moveTarget.set(null);
    this.moveIssueId.set(card.id);
  }

  protected closeMove(): void {
    if (this.moving()) return;
    this.moveIssueId.set(null);
    this.moveError.set('');
  }

  protected confirmMove(): void {
    const card = this.moveCard();
    const status = this.moveTarget();
    if (card && status) void this.move(card, status);
  }

  private async move(card: WorkCard, status: WorkColumnId): Promise<void> {
    if (this.moving()) return;
    this.moveError.set('');
    this.announcement.set('');
    this.moving.set(true);
    try {
      const updated = await this.work.moveIssueToStatus(card, status);
      this.moveIssueId.set(null);
      this.announcement.set(this.work.getIssueKey(updated) + ' · ' + WORK_STATUS_LABELS[updated.columnId]);
      if (this.remoteList()) await this.load();
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.status : 0;
      if (code === 409 || code === 403 || code === 404 || code === 422) {
        this.moveIssueId.set(null);
        await this.load();
        this.moveError.set(code === 403
          ? 'Ya no tienes permiso para mover esta incidencia.'
          : 'El estado o la lista destino cambió. Revisa los datos actualizados.');
      } else {
        this.moveError.set('No se pudo mover la incidencia. Inténtalo de nuevo.');
      }
    } finally {
      this.moving.set(false);
    }
  }

  protected updateUrl(queryParams: Params, replaceUrl = false): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl});
  }
}

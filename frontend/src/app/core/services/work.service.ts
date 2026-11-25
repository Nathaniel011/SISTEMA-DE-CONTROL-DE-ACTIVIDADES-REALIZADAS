import {computed, effect, inject, Injectable, signal, untracked} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {PermissionsService} from './permissions.service';
import {AuthService} from './auth.service';
import {UpdateIssuePayload, WorkApiService, DashboardResponse} from './work-api.service';
import {IssueFieldValues, ProjectTransition} from './project-configuration-api.service';
import {
  createDefaultWorkState,
  newBoardId,
  newCardId,
  WORK_STATUS_LABELS,
  WORK_COLUMNS,
  WorkBoard,
  WorkBoardList,
  WorkCard,
  WorkColumnId,
  WorkComment,
  WorkActiveTimer,
  WorkState,
  WorkTimeEntry,
  WorkAttachment,
} from '../../features/work/work.models';
import {WORK_DRAFT_CARD_TITLE} from '../../features/work/work.utils';

const STORAGE_KEY = 'scar-work-v2';
const RECENT_BOARDS_KEY = 'scar-recent-boards';
const FAVORITE_BOARDS_KEY = 'scar-favorite-boards';
const MAX_RECENT_BOARDS = 4;

export type WorkIssueFilter = 'all' | 'assigned' | 'commented' | 'mentioned' | 'unassigned';

@Injectable({ providedIn: 'root' })
export class WorkService {
  private authService = inject(AuthService);
  private permissions = inject(PermissionsService);
  private workApi = inject(WorkApiService);
  private state = signal<WorkState>(
    environment.useApi ? this.emptyState() : this.loadState()
  );
  private loading = signal(false);
  private loadError = signal<string | null>(null);
  private cacheToken: string | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private boardCardsPromises = new Map<string, Promise<void>>();
  private loadedBoardIds = new Set<string>();
  private allCardsPromise: Promise<void> | null = null;
  private allCardsLoaded = signal(false);
  private movableIssues = signal(new Set<string>());
  private issueListColumns = signal<Record<string, WorkColumnId>>({});
  private projectTransitions = signal<Record<string, ProjectTransition[]>>({});
  private boardPreferencesRevision = signal(0);
  private dashboardRequest = 0;

  dashboardMetrics = signal<DashboardResponse | null>(null);
  dashboardLoading = signal(false);

  selectedBoardId = signal<string | 'all'>('all');
  activeSavedSearch = signal<WorkIssueFilter>('all');

  isLoading = computed(() => this.loading());
  bootstrapError = computed(() => this.loadError());
  activeTimer = computed(() => this.state().activeTimer);
  boards = computed(() => this.state().boards);
  boardLists = computed(() => this.state().boardLists);
  cards = computed(() => this.state().cards);
  members = computed(() => this.state().members);

  staffMembers = computed(() =>
    this.members().filter(member => {
      const roles = member.roles?.length ? member.roles : [member.role];
      return !roles.some(role => this.permissions.isPrivilegedRole(role));
    })
  );

  assignableMembers = computed(() => {
    if (!this.canAssignTasks()) {
      return [];
    }
    if (this.permissions.isSecretary()) {
      return this.staffMembers();
    }
    return this.members();
  });

  generalBoard = computed(() =>
    this.boards().find(b => b.type === 'general' || b.key === 'GEN') ?? null
  );

  standardBoards = computed(() =>
    this.boards().filter(b => b.type !== 'general' && b.key !== 'GEN')
  );

  constructor() {
    if (environment.useApi) {
      effect(() => {
        const token = this.authService.getToken();
        const authenticated = this.authService.isAuthenticated();
        untracked(() => {
          this.resetWorkspaceCache(token);
          if (authenticated) void this.loadFromApi().catch(() => undefined);
        });
      });
    }
  }

  private resetWorkspaceCache(token: string | null): void {
    if (this.cacheToken === token) return;
    this.cacheToken = token;
    this.state.set(this.emptyState());
    this.bootstrapPromise = null;
    this.allCardsPromise = null;
    this.boardCardsPromises.clear();
    this.loadedBoardIds.clear();
    this.allCardsLoaded.set(false);
    this.loading.set(false);
    this.loadError.set(null);
    this.movableIssues.set(new Set());
    this.issueListColumns.set({});
    this.projectTransitions.set({});
    this.selectedBoardId.set('all');
    this.activeSavedSearch.set('all');
    this.dashboardMetrics.set(null);
    this.dashboardLoading.set(false);
    this.dashboardRequest++;
  }

  async loadFromApi(): Promise<void> {
    const session = this.authService.getToken();
    if (!environment.useApi || !session) {
      return;
    }
    this.resetWorkspaceCache(session);
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }
    if (this.allCardsPromise) {
      return this.allCardsPromise;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.bootstrapPromise = (async () => {
      try {
        void this.loadUserPreferences();
        const data = await firstValueFrom(this.workApi.bootstrap({ cards: 'none' }));
        if (this.authService.getToken() !== session) return;
        this.state.set({
          boards: data.boards.map(b => ({ ...b, type: b.type ?? 'standard' })),
          boardLists: (data.boardLists ?? []).map(list => this.mapBoardList(list)),
          cards: [],
          members: data.members,
          activeTimer: data.activeTimer,
        });
        this.allCardsLoaded.set(false);
        this.loadedBoardIds.clear();
        this.movableIssues.set(new Set());
        this.issueListColumns.set(data.boardListColumns ?? {});
        this.projectTransitions.set(data.projectTransitions ?? {});
      } catch {
        if (this.authService.getToken() !== session) return;
        this.loadError.set('No se pudo cargar los datos del tablero');
        throw new Error('bootstrap failed');
      } finally {
        if (this.authService.getToken() === session) {
          this.loading.set(false);
          this.bootstrapPromise = null;
        }
      }
    })();
    return this.bootstrapPromise;
  }

  async ensureBoardCards(boardId: string): Promise<void> {
    const session = this.authService.getToken();
    if (!environment.useApi || !session || !boardId) {
      return;
    }
    this.resetWorkspaceCache(session);
    const existing = this.boardCardsPromises.get(boardId);
    if (existing) {
      return existing;
    }
    if (this.allCardsLoaded() || this.loadedBoardIds.has(boardId)) {
      return;
    }
    const promise = (async () => {
      try {
        const {cards, movableIssueIds} = await firstValueFrom(this.workApi.getProjectCards(boardId));
        if (this.authService.getToken() !== session) return;
        this.mergeCards(cards);
        this.movableIssues.update(ids => {
          const next = new Set(ids);
          for (const card of cards) next.delete(card.id);
          for (const id of movableIssueIds) next.add(id);
          return next;
        });
        this.loadedBoardIds.add(boardId);
      } finally {
        if (this.authService.getToken() === session) this.boardCardsPromises.delete(boardId);
      }
    })();
    this.boardCardsPromises.set(boardId, promise);
    return promise;
  }

  async ensureAllCards(refresh = false): Promise<void> {
    const session = this.authService.getToken();
    if (!environment.useApi || !session) {
      return;
    }
    this.resetWorkspaceCache(session);
    if (this.allCardsPromise) {
      return this.allCardsPromise;
    }
    if (this.allCardsLoaded() && !refresh) {
      return;
    }
    const pendingBootstrap = this.bootstrapPromise;
    this.allCardsPromise = (async () => {
      try {
        await pendingBootstrap?.catch(() => undefined);
        if (this.authService.getToken() !== session) return;
        const data = await firstValueFrom(this.workApi.bootstrap({ cards: 'all' }));
        if (this.authService.getToken() !== session) return;
        this.state.set({
          boards: data.boards.map(b => ({ ...b, type: b.type ?? 'standard' })),
          boardLists: (data.boardLists ?? []).map(list => this.mapBoardList(list)),
          cards: data.cards,
          members: data.members,
          activeTimer: data.activeTimer,
        });
        this.movableIssues.set(new Set(data.movableIssueIds ?? []));
        this.issueListColumns.set(data.boardListColumns ?? {});
        this.projectTransitions.set(data.projectTransitions ?? {});
        this.allCardsLoaded.set(true);
      } finally {
        if (this.authService.getToken() === session) this.allCardsPromise = null;
      }
    })();
    return this.allCardsPromise;
  }

  async loadIssue(reference: string): Promise<WorkCard | undefined> {
    if (!environment.useApi) {
      return this.cards().find(card => card.id === reference || this.getIssueKey(card) === reference.toUpperCase());
    }
    const session = this.authService.getToken();
    const [card] = await Promise.all([firstValueFrom(this.workApi.getIssue(reference)), this.loadProjectIndex()]);
    if (this.authService.getToken() !== session) return undefined;
    this.replaceCard(card);
    return card;
  }

  async loadProjectIndex(): Promise<void> {
    if (!this.boards().length || this.bootstrapPromise) await this.loadFromApi();
  }

  updateProjectWorkflow(projectId: string, transitions: ProjectTransition[] | null): void {
    this.projectTransitions.update(current => {
      const next = {...current};
      if (transitions === null) delete next[projectId];
      else next[projectId] = transitions;
      return next;
    });
  }

  allowedStates(card: WorkCard): WorkColumnId[] {
    const configured = this.projectTransitions()[card.boardId];
    return WORK_COLUMNS.map(column => column.id).filter(status => status !== card.columnId
      && (!configured || configured.some(rule => rule.from === card.columnId && rule.to === status)));
  }

  private readonly currentListStates = computed(() => new Map(this.boardLists().map(list => [list.id, list.columnId])));

  getBoardListState(listId: string): WorkColumnId | undefined {
    return this.currentListStates().get(listId) ?? this.issueListColumns()[listId];
  }

  getIssueDestinations(card: WorkCard, editable = this.movableIssues().has(card.id)): ReadonlyMap<WorkColumnId, WorkBoardList | null> {
    const destinations = new Map<WorkColumnId, WorkBoardList | null>();
    if (!editable) return destinations;

    const lists = this.getBoardLists(card.boardId);
    for (const status of this.allowedStates(card)) {
      const list = lists.find(candidate => this.getBoardListState(candidate.id) === status);
      if (list || this.projectTransitions()[card.boardId]) destinations.set(status, list ?? null);
    }
    return destinations;
  }

  async moveIssueToStatus(card: WorkCard, status: WorkColumnId): Promise<WorkCard> {
    const destinations = this.getIssueDestinations(card);
    if (!destinations.has(status)) throw new Error('El flujo no admite este estado.');
    const list = destinations.get(status);
    const updated = await firstValueFrom(this.workApi.moveIssue(card.id, {
      columnId: status,
      boardListId: list?.id,
      expectedSourceColumn: card.columnId,
    }));
    this.replaceCard(updated);
    return updated;
  }

  canEditCard(card: WorkCard): boolean {
    return !environment.useApi || this.movableIssues().has(card.id);
  }

  async assignIncomingIssue(id: string, boardId: string, assigneeId: string): Promise<WorkCard | void> {
    if (environment.useApi) {
      const updated = await firstValueFrom(this.workApi.assignIncomingIssue(id, boardId, assigneeId));
      this.replaceCard(updated);
      return updated;
    }
    await this.moveCardToBoard(id, boardId, 'todo');
    return this.updateCardAsync(id, {assigneeId});
  }

  async loadDashboard(options?: string | { projectId?: string; startDate?: string; endDate?: string }): Promise<void> {
    const filters = typeof options === 'string' ? { projectId: options } : options;
    if (!environment.useApi) {
      this.dashboardMetrics.set(this.getDashboardMetrics() as DashboardResponse);
      return;
    }
    const session = this.authService.getToken();
    const request = ++this.dashboardRequest;
    this.dashboardLoading.set(true);
    try {
      const metrics = await firstValueFrom(this.workApi.getDashboard(filters));
      if (request === this.dashboardRequest && this.authService.getToken() === session) this.dashboardMetrics.set(metrics);
    } finally {
      if (request === this.dashboardRequest && this.authService.getToken() === session) this.dashboardLoading.set(false);
    }
  }

  async loadUserPreferences(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    try {
      const session = this.authService.getToken();
      const prefs = await firstValueFrom(this.workApi.getUserPreferences());
      if (this.authService.getToken() !== session) return;
      const filter = prefs.activeIssueFilter as WorkIssueFilter;
      if (['all', 'assigned', 'commented', 'mentioned', 'unassigned'].includes(filter)) {
        this.activeSavedSearch.set(filter);
      }
    } catch {
      // Preferencias opcionales; mantener valor por defecto.
    }
  }

  seedIssueSummary(card: WorkCard, editable: boolean): void {
    const existing = this.getCard(card.id);
    const fields = {title: card.title, boardId: card.boardId, boardListId: card.boardListId, columnId: card.columnId,
      dueDate: card.dueDate, assigneeId: card.assigneeId, priority: card.priority, updatedAt: card.updatedAt};
    this.replaceCard(existing ? {...existing, ...fields} : card);
    this.movableIssues.update(ids => {
      const next = new Set(ids);
      if (editable) next.add(card.id);
      else next.delete(card.id);
      return next;
    });
  }

  async saveActiveSearch(filter: WorkIssueFilter): Promise<void> {
    this.activeSavedSearch.set(filter);
    if (!environment.useApi) {
      return;
    }
    try {
      await firstValueFrom(this.workApi.updateUserPreferences(filter));
    } catch {
      // No bloquear la UI si falla la persistencia.
    }
  }

  private mergeCards(incoming: WorkCard[]): void {
    if (!incoming.length) {
      return;
    }
    const byId = new Map(this.cards().map(card => [card.id, card]));
    for (const card of incoming) {
      byId.set(card.id, card);
    }
    this.patch({ cards: Array.from(byId.values()) });
  }

  patchMembers(members: WorkState['members']): void {
    this.patch({ members });
  }

  patchBoardMembers(boardId: string, memberIds: string[]): void {
    this.patch({
      boards: this.boards().map(board =>
        board.id === boardId ? { ...board, memberIds } : board
      ),
    });
  }

  getCardsInColumn(boardId: string, columnId: WorkColumnId): WorkCard[] {
    return this.cards()
      .filter(c => c.boardId === boardId && c.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  }

  getBoardLists(boardId: string): WorkBoardList[] {
    return this.boardLists()
      .filter(list => list.boardId === boardId && !list.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  canManageBoardLists(): boolean {
    return this.permissions.canManageBoardLists();
  }

  canAssignTasks(): boolean {
    return this.permissions.canAssignTasks();
  }

  canDeleteIssues(): boolean {
    return this.permissions.canDeleteIssues();
  }

  canManageBoardMembers(): boolean {
    return this.permissions.canManageBoardMembers();
  }

  getBoardStats(boardId: string) {
    const boardCards = this.cards().filter(c => c.boardId === boardId);
    return {
      total: boardCards.length,
      inProgress: boardCards.filter(c => c.columnId === 'in_progress' || c.columnId === 'review').length,
      done: boardCards.filter(c => c.columnId === 'done').length,
      trackedMinutes: boardCards.reduce((sum, c) => sum + c.trackedMinutes, 0),
    };
  }

  getBoard(id: string): WorkBoard | undefined {
    return this.boards().find(b => b.id === id);
  }

  getGeneralBoardId(): string | null {
    return this.generalBoard()?.id ?? null;
  }

  getReceivedListId(boardId: string): string | null {
    const list = this.boardLists()
      .filter(l => l.boardId === boardId && !l.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find(l => l.name.toLowerCase().includes('recib'));
    return list?.id ?? this.getBoardLists(boardId)[0]?.id ?? null;
  }

  recordBoardVisit(boardId: string): void {
    if (!this.getBoard(boardId)) return;
    try {
      const recent = this.getRecentBoardIds().filter(id => id !== boardId);
      recent.unshift(boardId);
      localStorage.setItem(RECENT_BOARDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_BOARDS)));
      this.boardPreferencesRevision.update(revision => revision + 1);
    } catch {
      /* ignore */
    }
  }

  getRecentBoardIds(): string[] {
    return this.readAccessibleBoardIds(RECENT_BOARDS_KEY);
  }

  getFavoriteBoardIds(): string[] {
    const user = this.authService.currentUser();
    return user ? this.readAccessibleBoardIds(`${FAVORITE_BOARDS_KEY}:${user.id}`) : [];
  }

  toggleFavoriteBoard(boardId: string): boolean {
    const user = this.authService.currentUser();
    if (!user || !this.getBoard(boardId)) return false;
    const favorites = this.getFavoriteBoardIds();
    const next = favorites.includes(boardId)
      ? favorites.filter(id => id !== boardId)
      : [...favorites, boardId];
    try {
      localStorage.setItem(`${FAVORITE_BOARDS_KEY}:${user.id}`, JSON.stringify(next));
      this.boardPreferencesRevision.update(revision => revision + 1);
      return true;
    } catch {
      return false;
    }
  }

  private readAccessibleBoardIds(key: string): string[] {
    this.boardPreferencesRevision();
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const ids: unknown = JSON.parse(raw);
      if (!Array.isArray(ids)) return [];
      return [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!this.getBoard(id)))];
    } catch {
      return [];
    }
  }

  async createIncomingNote(title: string, extra?: {
    description?: string;
    requesterName?: string;
    requesterPhone?: string;
    requesterEmail?: string;
    receptionChannel?: string;
  }): Promise<WorkCard> {
    const generalId = this.getGeneralBoardId();
    if (!generalId) {
      throw new Error('No hay tablero general disponible');
    }
    const listId = this.getReceivedListId(generalId);
    return this.createIssue(
      generalId,
      title,
      'registered',
      listId ?? undefined,
      undefined,
      {
        description: extra?.description,
        receptionChannel: extra?.receptionChannel ?? 'oficina',
        requesterName: extra?.requesterName,
        requesterPhone: extra?.requesterPhone,
        requesterEmail: extra?.requesterEmail,
      }
    );
  }

  async createDraftCard(options: {
    boardId: string;
    columnId?: WorkColumnId;
    boardListId?: string;
    incoming?: boolean;
  }): Promise<WorkCard> {
    if (options.incoming) {
      return this.createIncomingNote(WORK_DRAFT_CARD_TITLE);
    }

    const lists = this.getBoardLists(options.boardId);
    const listId =
      options.boardListId ??
      lists.find(l => l.name.toLowerCase() === 'tarea')?.id ??
      lists[0]?.id;

    return this.createIssue(
      options.boardId,
      WORK_DRAFT_CARD_TITLE,
      options.columnId ?? 'todo',
      listId
    );
  }

  getCard(id: string): WorkCard | undefined {
    return this.cards().find(c => c.id === id);
  }

  getIssueKey(card: WorkCard): string {
    const board = this.getBoard(card.boardId);
    return `${board?.key ?? 'ARG'}-${card.issueNumber}`;
  }

  getStatusLabel(columnId: WorkColumnId): string {
    return WORK_STATUS_LABELS[columnId];
  }

  getIssueListName(card: WorkCard): string | null {
    if (!card.boardListId) return null;
    return this.boardLists().find(list => list.id === card.boardListId)?.name ?? null;
  }

  getIssueDisplayStatus(card: WorkCard): string {
    return this.getIssueListName(card) ?? this.getStatusLabel(card.columnId);
  }

  getBoardListsForCreate(boardId: string): WorkBoardList[] {
    return this.getBoardLists(boardId);
  }

  resolveIssuePlacement(
    boardId: string,
    assigneeId: string | null,
    boardListId?: string | null
  ): { boardListId?: string; columnId: WorkColumnId } {
    if (boardListId) {
      const list = this.boardLists().find(l => l.id === boardListId);
      return { boardListId, columnId: this.columnIdForListName(list?.name) };
    }
    if (assigneeId) {
      const listId = this.findBoardListIdByName(boardId, 'asignado');
      return { boardListId: listId, columnId: 'in_assignment' };
    }
    const listId = this.findBoardListIdByName(boardId, 'pendiente');
    return { boardListId: listId, columnId: 'todo' };
  }

  private findBoardListIdByName(boardId: string, fragment: string): string | undefined {
    return this.getBoardLists(boardId).find(l =>
      l.name.toLowerCase().includes(fragment)
    )?.id;
  }

  private columnIdForListName(name?: string): WorkColumnId {
    if (!name) return 'todo';
    const lower = name.toLowerCase();
    if (lower.includes('hecho') || lower.includes('done')) return 'done';
    if (lower.includes('proceso') || lower.includes('curso')) return 'in_progress';
    if (lower.includes('asign')) return 'in_assignment';
    if (lower.includes('registr')) return 'registered';
    return 'todo';
  }

  getMember(id: string | null) {
    if (!id) return undefined;
    return this.members().find(m => m.id === id);
  }

  getFilteredIssues(query = ''): WorkCard[] {
    const list = this.filterIssues(
      this.cards(),
      this.activeSavedSearch(),
      this.selectedBoardId(),
      query
    );
    return list.sort((a, b) =>
      this.getIssueKey(b).localeCompare(this.getIssueKey(a), undefined, { numeric: true })
    );
  }

  countForSearch(filter: WorkIssueFilter): number {
    return this.filterIssues(this.cards(), filter, this.selectedBoardId(), '').length;
  }

  currentMemberId(): string | undefined {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return this.members()[0]?.id;
    }
    return this.members().find(m => m.id === userId)?.id ??
      (environment.useApi ? userId : this.members()[0]?.id);
  }

  filterIssues(
    cards: WorkCard[],
    search: WorkIssueFilter,
    projectId: string | 'all',
    query: string
  ): WorkCard[] {
    const currentMember = this.currentMemberId();
    let list = [...cards];

    if (projectId !== 'all') {
      list = list.filter(c => c.boardId === projectId);
    }

    switch (search) {
      case 'assigned':
        list = list.filter(c => c.assigneeId === currentMember);
        break;
      case 'unassigned':
        list = list.filter(c => !c.assigneeId);
        break;
      case 'commented':
        list = list.filter(c => c.comments.some(cm => cm.authorId === currentMember));
        break;
      case 'mentioned':
        list = list.filter(c =>
          c.comments.some(cm => currentMember && cm.text.includes(`@${this.authService.currentUser()?.username}`))
        );
        break;
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(c => {
        const key = this.getIssueKey(c).toLowerCase();
        return key.includes(q) || c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q);
      });
    }

    return list;
  }

  getAllTimeEntries(): { entry: WorkTimeEntry; card: WorkCard }[] {
    return this.cards().flatMap(card =>
      card.timeEntries.map(entry => ({ entry, card }))
    ).sort((a, b) => b.entry.loggedAt.localeCompare(a.entry.loggedAt));
  }

  getDashboardMetrics() {
    const cards = this.cards();
    return {
      total: cards.length,
      open: cards.filter(c => c.columnId !== 'done').length,
      inProgress: cards.filter(c => c.columnId === 'in_progress' || c.columnId === 'review').length,
      done: cards.filter(c => c.columnId === 'done').length,
      unassigned: cards.filter(c => !c.assigneeId).length,
      critical: cards.filter(c => c.priority === 'critical').length,
      trackedMinutes: cards.reduce((sum, c) => sum + c.trackedMinutes, 0),
      byStatus: [
        { label: 'Pendiente', count: cards.filter(c => c.columnId === 'backlog' || c.columnId === 'todo').length },
        { label: 'En curso', count: cards.filter(c => c.columnId === 'in_progress' || c.columnId === 'review').length },
        { label: 'Hecho', count: cards.filter(c => c.columnId === 'done').length },
      ],
      byPriority: [
        { label: 'Crítico', count: cards.filter(c => c.priority === 'critical').length },
        { label: 'Mayor', count: cards.filter(c => c.priority === 'high').length },
        { label: 'Normal', count: cards.filter(c => c.priority === 'medium' || c.priority === 'low').length },
      ],
    };
  }

  getTimeByMember(): { memberId: string; name: string; minutes: number }[] {
    const totals = new Map<string, number>();
    for (const card of this.cards()) {
      for (const entry of card.timeEntries) {
        totals.set(entry.memberId, (totals.get(entry.memberId) ?? 0) + entry.minutes);
      }
    }
    return this.members()
      .map(m => ({ memberId: m.id, name: m.name, minutes: totals.get(m.id) ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  }

  startTimer(cardId: string, note = ''): Promise<void> {
    if (environment.useApi) {
      return firstValueFrom(this.workApi.startTimer(cardId, note)).then(timer => {
        this.patch({ activeTimer: timer });
      });
    }
    this.patch({ activeTimer: { cardId, startedAt: new Date().toISOString(), note } });
    return Promise.resolve();
  }

  stopTimer(): Promise<WorkTimeEntry | void> {
    if (environment.useApi) {
      return firstValueFrom(this.workApi.stopTimer()).then(entry => {
        const timer = this.activeTimer();
        if (timer) {
          this.appendTimeEntry(timer.cardId, entry);
        }
        this.patch({ activeTimer: null });
        return entry;
      });
    }

    const timer = this.activeTimer();
    if (!timer) return Promise.resolve();
    const elapsedMs = Date.now() - new Date(timer.startedAt).getTime();
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    return this.logTime(timer.cardId, minutes, timer.note || 'Registro automático del cronómetro').then(entry => {
      this.patch({ activeTimer: null });
      return entry;
    });
  }

  cancelTimer(): void {
    this.patch({ activeTimer: null });
  }

  timerElapsedSeconds(): number {
    const timer = this.activeTimer();
    if (!timer) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000));
  }

  async createBoard(payload: Pick<WorkBoard, 'name' | 'description'>): Promise<WorkBoard> {
    if (environment.useApi) {
      const board = await firstValueFrom(this.workApi.createBoard(payload));
      this.patch({boards: [...this.boards().filter(item => item.id !== board.id), board]});
      try {
        const lists = await firstValueFrom(this.workApi.getBoardLists(board.id));
        this.patch({boardLists: [...this.boardLists().filter(list => list.boardId !== board.id), ...lists.map(list => this.mapBoardList(list))]});
      } catch {
        // The board was created. A subsequent bootstrap refreshes its lists.
      }
      return board;
    }
    const board: WorkBoard = {
      id: newBoardId(),
      name: payload.name.trim(),
      description: payload.description?.trim() ?? '',
      key: payload.name.trim().toUpperCase().slice(0, 4),
      accent: 'bg-teal-500',
      memberIds: this.members().slice(0, 2).map(m => m.id),
      type: 'standard',
      createdAt: new Date().toISOString(),
    };
    const now = new Date().toISOString();
    const taskList: WorkBoardList = {
      id: newBoardId(),
      boardId: board.id,
      name: 'Tarea',
      sortOrder: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    this.patch({
      boards: [...this.boards(), board],
      boardLists: [...this.boardLists(), taskList],
    });
    return board;
  }

  async deleteBoard(boardId: string): Promise<void> {
    if (environment.useApi) {
      await firstValueFrom(this.workApi.deleteBoard(boardId));
    }
    const children = new Map<string, string[]>();
    for (const board of this.boards()) {
      if (!board.parentBoardId) continue;
      const siblings = children.get(board.parentBoardId) ?? [];
      siblings.push(board.id);
      children.set(board.parentBoardId, siblings);
    }
    const removed = new Set([boardId]);
    for (const parentId of removed) {
      for (const childId of children.get(parentId) ?? []) removed.add(childId);
    }
    this.patch({
      boards: this.boards().filter(board => !removed.has(board.id)),
      boardLists: this.boardLists().filter(list => !removed.has(list.boardId)),
      cards: this.cards().filter(card => !removed.has(card.boardId)),
    });
    if (removed.has(this.selectedBoardId())) this.selectedBoardId.set('all');
  }

  async createIssue(
    boardId: string,
    title: string,
    columnId: WorkColumnId = 'todo',
    boardListId?: string,
    parentIssueId?: string,
    options?: {
      assigneeId?: string | null;
      description?: string;
      requesterName?: string;
      requesterPhone?: string;
      requesterEmail?: string;
      receptionChannel?: string;
      customFields?: IssueFieldValues;
    }
  ): Promise<WorkCard> {
    const placement = this.resolveIssuePlacement(boardId, options?.assigneeId ?? null, boardListId);
    const resolvedListId = boardListId ?? placement.boardListId;
    const resolvedColumnId = options?.receptionChannel ? 'registered' : boardListId ? columnId : placement.columnId;

    if (environment.useApi) {
      const card = await firstValueFrom(
        this.workApi.createIssue({
          boardId,
          title,
          description: options?.description,
          columnId: resolvedColumnId,
          boardListId: resolvedListId,
          parentIssueId,
          assigneeId: options?.assigneeId ?? undefined,
          requesterName: options?.requesterName,
          requesterPhone: options?.requesterPhone,
          requesterEmail: options?.requesterEmail,
          receptionChannel: options?.receptionChannel,
          customFields: options?.customFields,
        })
      );
      this.replaceCard(card);
      this.movableIssues.update(ids => new Set([...ids, card.id]));
      return card;
    }

    const issueNumber = this.nextIssueNumber(boardId);
    const now = new Date().toISOString();
    const currentUser = this.authService.currentUser();
    const assignee =
      options?.assigneeId ??
      this.members().find(m => m.id === currentUser?.id)?.id ??
      null;
    const card: WorkCard = {
      id: newCardId(),
      boardId,
      boardListId: resolvedListId ?? null,
      parentIssueId: parentIssueId,
      issueNumber,
      columnId: resolvedColumnId,
      title: title.trim(),
      description: options?.description ?? '',
      priority: 'medium',
      assigneeId: assignee,
      dueDate: null,
      estimateMinutes: null,
      trackedMinutes: 0,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: this.nextOrder(boardId, resolvedColumnId),
      receptionChannel: options?.receptionChannel,
      requesterName: options?.requesterName,
      requesterPhone: options?.requesterPhone,
      requesterEmail: options?.requesterEmail,
      createdAt: now,
      updatedAt: now,
    };
    this.patch({ cards: [...this.cards(), card] });
    return card;
  }

  async createCard(boardId: string, columnOrListId: string, title: string, useList = false, parentIssueId?: string): Promise<WorkCard> {
    if (useList) {
      const card = await this.createIssue(boardId, title, 'todo', columnOrListId, parentIssueId);
      return this.getCard(card.id) ?? card;
    }
    const card = await this.createIssue(boardId, title, columnOrListId as WorkColumnId);
    return this.getCard(card.id) ?? card;
  }

  async createSubtask(parentCardId: string, title: string): Promise<WorkCard> {
    const parent = this.getCard(parentCardId);
    if (!parent) {
      throw new Error('Tarjeta padre no encontrada');
    }
    return this.createCard(
      parent.boardId,
      parent.boardListId ?? parent.columnId,
      title,
      !!parent.boardListId,
      parentCardId
    );
  }

  async createBoardList(boardId: string, name: string): Promise<void> {
    const lists = this.getBoardLists(boardId);
    if (environment.useApi) {
      const created = await firstValueFrom(
        this.workApi.createBoardList(boardId, { name: name.trim(), sortOrder: lists.length })
      );
      this.patch({ boardLists: [...this.boardLists(), this.mapBoardList(created)] });
      return;
    }
    const list: WorkBoardList = {
      id: crypto.randomUUID(),
      boardId,
      name: name.trim(),
      sortOrder: lists.length,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.patch({ boardLists: [...this.boardLists(), list] });
  }

  async renameBoardList(boardId: string, listId: string, name: string): Promise<void> {
    const list = this.boardLists().find(l => l.id === listId);
    if (!list) return;
    if (environment.useApi) {
      const updated = await firstValueFrom(
        this.workApi.updateBoardList(boardId, listId, { name: name.trim(), sortOrder: list.sortOrder })
      );
      this.patch({
        boardLists: this.boardLists().map(l => (l.id === listId ? this.mapBoardList(updated) : l)),
      });
      return;
    }
    this.patch({
      boardLists: this.boardLists().map(l =>
        l.id === listId ? { ...l, name: name.trim(), updatedAt: new Date().toISOString() } : l
      ),
    });
  }

  async moveCardToList(cardId: string, listId: string, toIndex?: number): Promise<void> {
    if (environment.useApi) {
      const updated = await firstValueFrom(this.workApi.moveIssue(cardId, {boardListId: listId, targetIndex: toIndex}));
      this.replaceCard(updated);
      return;
    }
    const card = this.getCard(cardId);
    if (!card) return;
    this.updateCard(cardId, { boardListId: listId, updatedAt: new Date().toISOString() });
  }

  updateCard(cardId: string, patch: Partial<WorkCard>): void {
    void this.updateCardAsync(cardId, patch);
  }

  updateCardAsync(cardId: string, patch: Partial<WorkCard>, customFields?: IssueFieldValues): Promise<WorkCard | void> {
    const card = this.getCard(cardId);
    if (!card) return Promise.resolve();

    const merged: WorkCard = { ...card, ...patch, updatedAt: new Date().toISOString() };
    this.replaceCard(merged);

    if (environment.useApi) {
      const payload: UpdateIssuePayload = {
        title: patch.title,
        description: patch.description,
        columnId: patch.columnId,
        priority: patch.priority,
        assigneeId: patch.assigneeId === null ? '' : patch.assigneeId,
        dueDate: patch.dueDate === null ? '' : patch.dueDate,
        estimateMinutes: patch.estimateMinutes,
        boardListId: patch.boardListId,
        requesterName: patch.requesterName,
        requesterPhone: patch.requesterPhone,
        requesterEmail: patch.requesterEmail,
        receptionChannel: patch.receptionChannel,
        startDate: patch.startDate,
        endDate: patch.endDate,
        issueType: patch.issueType === null ? '' : patch.issueType,
        observations: patch.observations === null ? '' : patch.observations,
        customFields,
      };
      return firstValueFrom(this.workApi.updateIssue(cardId, payload))
        .then(updated => {
          const result: WorkCard = {
            ...updated,
            attachments: updated.attachments.length ? updated.attachments : card.attachments,
            timeEntries: updated.timeEntries.length ? updated.timeEntries : card.timeEntries,
            comments: updated.comments.length ? updated.comments : card.comments,
          };
          this.replaceCard(result);
          return result;
        })
        .catch(error => {
          this.replaceCard(card);
          throw error;
        });
    }

    const cards = this.cards().map(c => c.id === cardId ? {
      ...merged,
      startDate: merged.startDate || undefined,
      endDate: merged.endDate || undefined,
    } : c);
    this.patch({ cards });
    return Promise.resolve(merged);
  }

  async moveCard(cardId: string, toColumnId: WorkColumnId, toIndex?: number): Promise<void> {
    if (environment.useApi) {
      const updated = await firstValueFrom(this.workApi.moveIssue(cardId, { columnId: toColumnId, targetIndex: toIndex }));
      this.replaceCard(updated);
      return;
    }

    const all = this.cards();
    const current = all.find(c => c.id === cardId);
    if (!current) return;

    const boardId = current.boardId;
    const fromColumn = current.columnId;
    const without = all.filter(c => c.id !== cardId);

    const dest = without
      .filter(c => c.boardId === boardId && c.columnId === toColumnId)
      .sort((a, b) => a.order - b.order);

    const insertAt = toIndex ?? dest.length;
    dest.splice(insertAt, 0, {
      ...current,
      columnId: toColumnId,
      updatedAt: new Date().toISOString(),
    });
    const newDest = dest.map((c, i) => ({ ...c, order: i, columnId: toColumnId }));

    const newSource =
      fromColumn !== toColumnId
        ? without
            .filter(c => c.boardId === boardId && c.columnId === fromColumn)
            .sort((a, b) => a.order - b.order)
            .map((c, i) => ({ ...c, order: i }))
        : [];

    const rest = without.filter(
      c => c.boardId !== boardId || (c.columnId !== toColumnId && c.columnId !== fromColumn)
    );

    this.patch({ cards: [...rest, ...newSource, ...newDest] });
  }

  moveCardToBoard(
    cardId: string,
    targetBoardId: string,
    targetColumnId: WorkColumnId,
    targetIndex?: number,
    boardListId?: string
  ): Promise<void> {
    if (environment.useApi) {
      return firstValueFrom(
        this.workApi.moveIssue(cardId, {
          columnId: targetColumnId,
          targetIndex,
          targetBoardId,
          boardListId,
        })
      ).then(updated => {
        const existing = this.getCard(cardId);
        this.replaceCard({
          ...updated,
          attachments: existing?.attachments ?? updated.attachments,
          timeEntries: existing?.timeEntries ?? updated.timeEntries,
          comments: existing?.comments ?? updated.comments,
        });
      });
    }

    const all = this.cards();
    const current = all.find(c => c.id === cardId);
    if (!current) return Promise.resolve();

    const sourceBoardId = current.boardId;
    const fromColumn = current.columnId;
    const without = all.filter(c => c.id !== cardId);

    // Recalculate source column orders
    const newSource = without
      .filter(c => c.boardId === sourceBoardId && c.columnId === fromColumn)
      .sort((a, b) => a.order - b.order)
      .map((c, i) => ({ ...c, order: i }));

    // Prepare destination column and insert moved card
    const dest = without
      .filter(c => c.boardId === targetBoardId && c.columnId === targetColumnId)
      .sort((a, b) => a.order - b.order);

    const insertAt = targetIndex ?? dest.length;
    const movedCard: WorkCard = {
      ...current,
      boardId: targetBoardId,
      boardListId: boardListId ?? this.getBoardLists(targetBoardId)[0]?.id ?? null,
      columnId: targetColumnId,
      issueNumber: this.nextIssueNumber(targetBoardId),
      updatedAt: new Date().toISOString(),
      order: insertAt,
    };

    dest.splice(insertAt, 0, movedCard);
    const newDest = dest.map((c, i) => ({ ...c, order: i, columnId: targetColumnId }));

    const rest = without.filter(
      c => !(c.boardId === sourceBoardId && c.columnId === fromColumn) && !(c.boardId === targetBoardId && c.columnId === targetColumnId)
    );

    this.patch({ cards: [...rest, ...newSource, ...newDest] });
    return Promise.resolve();
  }

  addComment(cardId: string, text: string, publicReply = false): Promise<WorkComment | void> {
    if (!text.trim()) return Promise.resolve();

    if (environment.useApi) {
      return firstValueFrom(this.workApi.addComment(cardId, text, publicReply)).then(comment => {
        const card = this.getCard(cardId);
        if (!card) return comment;
        const sla = card.sla && comment.publicReply && !card.sla.firstReplyAt
          ? {...card.sla, firstReplyAt: comment.createdAt} : card.sla;
        this.replaceCard({...card, sla, comments: [...card.comments, comment]});
        return comment;
      });
    }

    const card = this.getCard(cardId);
    if (!card) return Promise.resolve();
    const authorId = this.currentMemberId() ?? this.members()[0].id;
    const comment: WorkComment = {
      id: crypto.randomUUID(),
      authorId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    this.updateCard(cardId, { comments: [...card.comments, comment] });
    return Promise.resolve(comment);
  }

  logTime(
    cardId: string,
    minutes: number,
    note: string,
    loggedAt?: string,
    activityType?: string
  ): Promise<WorkTimeEntry | void> {
    if (minutes <= 0) return Promise.resolve();

    if (environment.useApi) {
      return firstValueFrom(this.workApi.logTime(cardId, minutes, note, loggedAt, activityType)).then(entry => {
        this.appendTimeEntry(cardId, entry);
        return entry;
      });
    }

    const card = this.getCard(cardId);
    if (!card) return Promise.resolve();
    const memberId = this.currentMemberId() ?? this.members()[0].id;
    const entry: WorkTimeEntry = {
      id: crypto.randomUUID(),
      memberId,
      minutes,
      note: note.trim(),
      loggedAt: loggedAt ?? new Date().toISOString(),
      activityType: activityType ?? 'Trabajo',
    };
    this.updateCard(cardId, {
      timeEntries: [...card.timeEntries, entry],
      trackedMinutes: Math.max(0, card.trackedMinutes + minutes),
    });
    return Promise.resolve(entry);
  }

  addAttachment(cardId: string, attachment: WorkAttachment): void {
    const card = this.getCard(cardId);
    if (!card) return;
    this.replaceCard({
      ...card,
      attachments: [attachment, ...card.attachments],
    });
  }

  removeAttachment(cardId: string, attachmentId: string): void {
    const card = this.getCard(cardId);
    if (!card) return;
    this.replaceCard(
      {
        ...card,
        attachments: card.attachments.filter(a => a.id !== attachmentId),
      },
      { keepDetailsOnEmpty: false }
    );
  }

  appendTimeEntryPublic(cardId: string, entry: WorkTimeEntry): void {
    this.appendTimeEntry(cardId, entry);
  }

  replaceCardPublic(updated: WorkCard): void {
    this.replaceCard(updated);
  }

  deleteCard(cardId: string): Promise<void> {
    if (environment.useApi) {
      return firstValueFrom(this.workApi.deleteIssue(cardId)).then(() => {
        this.patch({ cards: this.cards().filter(c => c.id !== cardId) });
      });
    }
    this.patch({ cards: this.cards().filter(c => c.id !== cardId) });
    return Promise.resolve();
  }

  private appendTimeEntry(cardId: string, entry: WorkTimeEntry): void {
    const card = this.getCard(cardId);
    if (!card) return;
    this.replaceCard({
      ...card,
      timeEntries: [...card.timeEntries, entry],
      trackedMinutes: Math.max(0, card.trackedMinutes + entry.minutes),
    });
  }

  private replaceCard(
    updated: WorkCard,
    options: { keepDetailsOnEmpty?: boolean } = { keepDetailsOnEmpty: true }
  ): void {
    const existing = this.getCard(updated.id);
    const keepDetailsOnEmpty = options.keepDetailsOnEmpty ?? true;
    const merged: WorkCard = existing
      ? {
          ...existing,
          ...updated,
          attachments:
            keepDetailsOnEmpty && !updated.attachments.length && existing.attachments.length
              ? existing.attachments
              : updated.attachments,
          timeEntries:
            keepDetailsOnEmpty && !updated.timeEntries.length && existing.timeEntries.length
              ? existing.timeEntries
              : updated.timeEntries,
          comments:
            keepDetailsOnEmpty && !updated.comments.length && existing.comments.length
              ? existing.comments
              : updated.comments,
        }
      : updated;
    this.patch({
      cards: this.cards().some(c => c.id === merged.id)
        ? this.cards().map(c => (c.id === merged.id ? merged : c))
        : [...this.cards(), merged],
    });
  }

  private nextIssueNumber(boardId: string): number {
    const nums = this.cards().filter(c => c.boardId === boardId).map(c => c.issueNumber ?? 0);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }

  private nextOrder(boardId: string, columnId: WorkColumnId): number {
    const col = this.cards().filter(c => c.boardId === boardId && c.columnId === columnId);
    return col.length ? Math.max(...col.map(c => c.order)) + 1 : 0;
  }

  private emptyState(): WorkState {
    return {
      boards: [],
      boardLists: [],
      cards: [],
      members: [],
      activeTimer: null,
    };
  }

  private mapBoardList(raw: WorkBoardList & { projectId?: string }): WorkBoardList {
    return {
      id: String(raw.id),
      boardId: String(raw.boardId ?? raw.projectId),
      name: raw.name,
      sortOrder: raw.sortOrder,
      archived: raw.archived,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : String(raw.createdAt),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : String(raw.updatedAt),
      columnId: raw.columnId,
    };
  }

  private patch(partial: Partial<WorkState>): void {
    this.state.update(s => {
      const next = { ...s, ...partial };
      if (!environment.useApi) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  private loadState(): WorkState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return this.migrate(JSON.parse(raw) as WorkState);
      }
    } catch {
      /* default */
    }
    const defaults = createDefaultWorkState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  private migrate(state: WorkState): WorkState {
    const cards = state.cards.map((c, i) => ({
      ...c,
      issueNumber: c.issueNumber ?? i + 1,
    }));
    return { ...state, cards, boardLists: state.boardLists ?? [], activeTimer: state.activeTimer ?? null };
  }
}

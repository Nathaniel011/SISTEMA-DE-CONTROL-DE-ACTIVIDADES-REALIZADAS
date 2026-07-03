import {computed, effect, inject, Injectable, signal, untracked} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {PermissionsService} from './permissions.service';
import {AuthService} from './auth.service';
import {UpdateIssuePayload, WorkApiService, DashboardResponse} from './work-api.service';
import {
  createDefaultWorkState,
  newBoardId,
  newCardId,
  WORK_STATUS_LABELS,
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
  private bootstrapPromise: Promise<void> | null = null;
  private boardCardsPromises = new Map<string, Promise<void>>();
  private allCardsPromise: Promise<void> | null = null;
  private allCardsLoaded = signal(false);

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
        if (this.authService.isAuthenticated()) {
          untracked(() => void this.loadFromApi());
        }
      });
    }
  }

  async loadFromApi(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.bootstrapPromise = (async () => {
      try {
        const data = await firstValueFrom(this.workApi.bootstrap({ cards: 'none' }));
        this.state.set({
          boards: data.boards.map(b => ({ ...b, type: b.type ?? 'standard' })),
          boardLists: (data.boardLists ?? []).map(list => this.mapBoardList(list)),
          cards: [],
          members: data.members,
          activeTimer: data.activeTimer,
        });
        this.allCardsLoaded.set(false);
        await this.loadUserPreferences();
      } catch {
        this.loadError.set('No se pudo cargar los datos del tablero');
        throw new Error('bootstrap failed');
      } finally {
        this.loading.set(false);
        this.bootstrapPromise = null;
      }
    })();
    return this.bootstrapPromise;
  }

  async ensureBoardCards(boardId: string): Promise<void> {
    if (!environment.useApi || !boardId) {
      return;
    }
    const existing = this.boardCardsPromises.get(boardId);
    if (existing) {
      return existing;
    }
    const hasCards = this.cards().some(c => c.boardId === boardId);
    if (hasCards) {
      return;
    }
    const promise = (async () => {
      try {
        const cards = await firstValueFrom(this.workApi.getProjectCards(boardId));
        this.mergeCards(cards);
      } finally {
        this.boardCardsPromises.delete(boardId);
      }
    })();
    this.boardCardsPromises.set(boardId, promise);
    return promise;
  }

  async ensureAllCards(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    if (this.allCardsLoaded()) {
      return;
    }
    if (this.allCardsPromise) {
      return this.allCardsPromise;
    }
    this.allCardsPromise = (async () => {
      try {
        const data = await firstValueFrom(this.workApi.bootstrap({ cards: 'all' }));
        this.mergeCards(data.cards);
        this.allCardsLoaded.set(true);
      } finally {
        this.allCardsPromise = null;
      }
    })();
    return this.allCardsPromise;
  }

  async loadDashboard(options?: string | { projectId?: string; startDate?: string; endDate?: string }): Promise<void> {
    const filters = typeof options === 'string' ? { projectId: options } : options;
    if (!environment.useApi) {
      this.dashboardMetrics.set(this.getDashboardMetrics() as DashboardResponse);
      return;
    }
    this.dashboardLoading.set(true);
    try {
      const metrics = await firstValueFrom(this.workApi.getDashboard(filters));
      this.dashboardMetrics.set(metrics);
    } finally {
      this.dashboardLoading.set(false);
    }
  }

  async loadUserPreferences(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    try {
      const prefs = await firstValueFrom(this.workApi.getUserPreferences());
      const filter = prefs.activeIssueFilter as WorkIssueFilter;
      if (['all', 'assigned', 'commented', 'mentioned', 'unassigned'].includes(filter)) {
        this.activeSavedSearch.set(filter);
      }
    } catch {
      // Preferencias opcionales; mantener valor por defecto.
    }
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

  getCardsInList(boardId: string, listId: string): WorkCard[] {
    return this.cards()
      .filter(c => c.boardId === boardId && c.boardListId === listId)
      .sort((a, b) => a.order - b.order);
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
    try {
      const recent = this.getRecentBoardIds().filter(id => id !== boardId);
      recent.unshift(boardId);
      localStorage.setItem(RECENT_BOARDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_BOARDS)));
    } catch {
      /* ignore */
    }
  }

  getRecentBoardIds(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_BOARDS_KEY);
      if (!raw) return [];
      const ids = JSON.parse(raw) as string[];
      return ids.filter(id => !!this.getBoard(id));
    } catch {
      return [];
    }
  }

  async createIncomingNote(title: string, extra?: {
    requesterName?: string;
    requesterPhone?: string;
    requesterEmail?: string;
    receptionChannel?: string;
  }): Promise<WorkCard> {
    const generalId = this.getGeneralBoardId() ?? this.boards()[0]?.id;
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
    return this.members().find(m => m.id === userId)?.id ?? this.members()[0]?.id;
  }

  private filterIssues(
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
        return key.includes(q) || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
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

  createBoard(payload: Pick<WorkBoard, 'name' | 'description'>): WorkBoard {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.createBoard(payload)).then(async () => {
        await this.loadFromApi();
      });
      return {
        id: 'pending',
        name: payload.name,
        description: payload.description,
        key: 'PENDING',
        accent: 'bg-teal-500',
        memberIds: [],
        type: 'standard',
        createdAt: new Date().toISOString(),
      };
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
      this.patch({
        boards: this.boards().filter(board => board.id !== boardId),
        boardLists: this.boardLists().filter(list => list.boardId !== boardId),
        cards: this.cards().filter(card => card.boardId !== boardId),
      });
      if (this.selectedBoardId() === boardId) {
        this.selectedBoardId.set('all');
      }
      return;
    }
    this.patch({
      boards: this.boards().filter(board => board.id !== boardId),
      boardLists: this.boardLists().filter(list => list.boardId !== boardId),
      cards: this.cards().filter(card => card.boardId !== boardId),
    });
  }

  async createIssue(
    boardId: string,
    title: string,
    columnId: WorkColumnId = 'todo',
    boardListId?: string,
    parentIssueId?: string,
    options?: {
      assigneeId?: string | null;
      requesterName?: string;
      requesterPhone?: string;
      requesterEmail?: string;
      receptionChannel?: string;
    }
  ): Promise<WorkCard> {
    const placement = this.resolveIssuePlacement(boardId, options?.assigneeId ?? null, boardListId);
    const resolvedListId = boardListId ?? placement.boardListId;
    const resolvedColumnId = boardListId ? columnId : placement.columnId;

    if (environment.useApi) {
      const card = await firstValueFrom(
        this.workApi.createIssue({
          boardId,
          title,
          columnId: resolvedColumnId,
          boardListId: resolvedListId,
          parentIssueId,
          assigneeId: options?.assigneeId ?? undefined,
          requesterName: options?.requesterName,
          requesterPhone: options?.requesterPhone,
          requesterEmail: options?.requesterEmail,
          receptionChannel: options?.receptionChannel,
        })
      );
      this.replaceCard(card);
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
      description: '',
      priority: 'medium',
      assigneeId: assignee,
      dueDate: null,
      estimateMinutes: null,
      trackedMinutes: 0,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: this.nextOrder(boardId, resolvedColumnId),
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

  moveCardToList(cardId: string, listId: string, toIndex?: number): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.moveIssue(cardId, { boardListId: listId, targetIndex: toIndex })).then(updated => {
        this.replaceCard(updated);
      });
      return;
    }
    const card = this.getCard(cardId);
    if (!card) return;
    this.updateCard(cardId, { boardListId: listId, updatedAt: new Date().toISOString() });
  }

  updateCard(cardId: string, patch: Partial<WorkCard>): void {
    void this.updateCardAsync(cardId, patch);
  }

  updateCardAsync(cardId: string, patch: Partial<WorkCard>): Promise<WorkCard | void> {
    const card = this.getCard(cardId);
    if (!card) return Promise.resolve();

    const merged: WorkCard = { ...card, ...patch, updatedAt: new Date().toISOString() };
    this.replaceCard(merged);

    if (environment.useApi) {
      const payload: UpdateIssuePayload = {
        title: merged.title,
        description: merged.description,
        columnId: merged.columnId,
        priority: merged.priority,
        assigneeId: merged.assigneeId,
        dueDate: merged.dueDate,
        estimateMinutes: merged.estimateMinutes,
        boardListId: merged.boardListId,
        requesterName: merged.requesterName,
        requesterPhone: merged.requesterPhone,
        requesterEmail: merged.requesterEmail,
        receptionChannel: merged.receptionChannel,
        startDate: merged.startDate,
        endDate: merged.endDate,
        issueType: merged.issueType ?? undefined,
        observations: merged.observations,
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
        .catch(() => {
          this.replaceCard(card);
          throw new Error('update failed');
        });
    }

    const cards = this.cards().map(c => (c.id === cardId ? merged : c));
    this.patch({ cards });
    return Promise.resolve(merged);
  }

  moveCard(cardId: string, toColumnId: WorkColumnId, toIndex?: number): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.moveIssue(cardId, { columnId: toColumnId, targetIndex: toIndex })).then(updated => {
        this.replaceCard(updated);
      });
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

  addComment(cardId: string, text: string): Promise<WorkComment | void> {
    if (!text.trim()) return Promise.resolve();

    if (environment.useApi) {
      return firstValueFrom(this.workApi.addComment(cardId, text)).then(comment => {
        const card = this.getCard(cardId);
        if (!card) return comment;
        this.replaceCard({ ...card, comments: [...card.comments, comment] });
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

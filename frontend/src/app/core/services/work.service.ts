import {computed, effect, inject, Injectable, signal, untracked} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from './auth.service';
import {UpdateIssuePayload, WorkApiService} from './work-api.service';
import {
  createDefaultWorkState,
  newBoardId,
  newCardId,
  WORK_STATUS_LABELS,
  WorkBoard,
  WorkCard,
  WorkColumnId,
  WorkComment,
  WorkIssueType,
  WorkActiveTimer,
  WorkState,
  WorkTimeEntry,
} from '../../features/work/work.models';

const STORAGE_KEY = 'scar-work-v2';

export type WorkIssueFilter = 'all' | 'assigned' | 'commented' | 'mentioned' | 'unassigned';

@Injectable({ providedIn: 'root' })
export class WorkService {
  private authService = inject(AuthService);
  private workApi = inject(WorkApiService);
  private state = signal<WorkState>(
    environment.useApi ? this.emptyState() : this.loadState()
  );
  private loading = signal(false);

  selectedProjectId = signal<string | 'all'>('all');
  activeSavedSearch = signal<WorkIssueFilter>('all');

  isLoading = computed(() => this.loading());
  activeTimer = computed(() => this.state().activeTimer);
  boards = computed(() => this.state().boards);
  cards = computed(() => this.state().cards);
  labels = computed(() => this.state().labels);
  members = computed(() => this.state().members);

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
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.workApi.bootstrap());
      this.state.set({
        boards: data.boards,
        cards: data.cards,
        labels: data.labels,
        members: data.members,
        activeTimer: data.activeTimer,
      });
    } finally {
      this.loading.set(false);
    }
  }

  getCardsInColumn(boardId: string, columnId: WorkColumnId): WorkCard[] {
    return this.cards()
      .filter(c => c.boardId === boardId && c.columnId === columnId)
      .sort((a, b) => a.order - b.order);
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

  getMember(id: string | null) {
    if (!id) return undefined;
    return this.members().find(m => m.id === id);
  }

  getLabel(id: string) {
    return this.labels().find(l => l.id === id);
  }

  getFilteredIssues(query = ''): WorkCard[] {
    const list = this.filterIssues(
      this.cards(),
      this.activeSavedSearch(),
      this.selectedProjectId(),
      query
    );
    return list.sort((a, b) =>
      this.getIssueKey(b).localeCompare(this.getIssueKey(a), undefined, { numeric: true })
    );
  }

  countForSearch(filter: WorkIssueFilter): number {
    return this.filterIssues(this.cards(), filter, this.selectedProjectId(), '').length;
  }

  private currentMemberId(): string | undefined {
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

  startTimer(cardId: string, note = ''): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.startTimer(cardId, note)).then(timer => {
        this.patch({ activeTimer: timer });
      });
      return;
    }
    this.patch({ activeTimer: { cardId, startedAt: new Date().toISOString(), note } });
  }

  stopTimer(): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.stopTimer()).then(entry => {
        const timer = this.activeTimer();
        if (timer) {
          this.appendTimeEntry(timer.cardId, entry);
        }
        this.patch({ activeTimer: null });
      });
      return;
    }

    const timer = this.activeTimer();
    if (!timer) return;
    const elapsedMs = Date.now() - new Date(timer.startedAt).getTime();
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    this.logTime(timer.cardId, minutes, timer.note || 'Registro automático del cronómetro');
    this.patch({ activeTimer: null });
  }

  cancelTimer(): void {
    this.patch({ activeTimer: null });
  }

  timerElapsedSeconds(): number {
    const timer = this.activeTimer();
    if (!timer) return 0;
    return Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  }

  createBoard(payload: Pick<WorkBoard, 'name' | 'description' | 'key'>): WorkBoard {
    const board: WorkBoard = {
      id: newBoardId(),
      name: payload.name.trim(),
      description: payload.description.trim(),
      key: payload.key.trim().toUpperCase().slice(0, 4),
      accent: 'bg-teal-500',
      memberIds: this.members().slice(0, 2).map(m => m.id),
      createdAt: new Date().toISOString(),
    };
    this.patch({ boards: [...this.boards(), board] });
    return board;
  }

  createIssue(
    boardId: string,
    title: string,
    type: WorkIssueType = 'task',
    columnId: WorkColumnId = 'todo'
  ): WorkCard {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.createIssue({ boardId, title, type, columnId })).then(card => {
        this.patch({ cards: [...this.cards(), card] });
      });
      return {
        id: 'pending',
        boardId,
        issueNumber: 0,
        type,
        columnId,
        title,
        description: '',
        priority: 'medium',
        assigneeId: null,
        labelIds: [],
        dueDate: null,
        estimateMinutes: null,
        trackedMinutes: 0,
        comments: [],
        timeEntries: [],
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const issueNumber = this.nextIssueNumber(boardId);
    const now = new Date().toISOString();
    const currentUser = this.authService.currentUser();
    const assignee = this.members().find(m => m.id === currentUser?.id)?.id ?? null;
    const card: WorkCard = {
      id: newCardId(),
      boardId,
      issueNumber,
      type,
      columnId,
      title: title.trim(),
      description: '',
      priority: 'medium',
      assigneeId: assignee,
      labelIds: [],
      dueDate: null,
      estimateMinutes: null,
      trackedMinutes: 0,
      comments: [],
      timeEntries: [],
      order: this.nextOrder(boardId, columnId),
      createdAt: now,
      updatedAt: now,
    };
    this.patch({ cards: [...this.cards(), card] });
    return card;
  }

  createCard(boardId: string, columnId: WorkColumnId, title: string): WorkCard {
    const card = this.createIssue(boardId, title, 'task', columnId);
    return this.getCard(card.id) ?? card;
  }

  updateCard(cardId: string, patch: Partial<WorkCard>): void {
    if (environment.useApi) {
      const card = this.getCard(cardId);
      if (!card) return;
      const merged = { ...card, ...patch };
      const payload: UpdateIssuePayload = {
        title: merged.title,
        description: merged.description,
        type: merged.type,
        columnId: merged.columnId,
        priority: merged.priority,
        assigneeId: merged.assigneeId,
        dueDate: merged.dueDate,
        estimateMinutes: merged.estimateMinutes,
        labelIds: merged.labelIds,
        requesterName: merged.requesterName,
        requesterPhone: merged.requesterPhone,
        requesterEmail: merged.requesterEmail,
        receptionChannel: merged.receptionChannel,
        startDate: merged.startDate,
        endDate: merged.endDate,
      };
      void firstValueFrom(this.workApi.updateIssue(cardId, payload)).then(updated => {
        this.replaceCard(updated);
      });
      return;
    }

    const cards = this.cards().map(c =>
      c.id === cardId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
    );
    this.patch({ cards });
  }

  moveCard(cardId: string, toColumnId: WorkColumnId, toIndex?: number): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.moveIssue(cardId, toColumnId, toIndex)).then(updated => {
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

  addComment(cardId: string, text: string): void {
    if (!text.trim()) return;

    if (environment.useApi) {
      void firstValueFrom(this.workApi.addComment(cardId, text)).then(comment => {
        const card = this.getCard(cardId);
        if (!card) return;
        this.replaceCard({ ...card, comments: [...card.comments, comment] });
      });
      return;
    }

    const card = this.getCard(cardId);
    if (!card) return;
    const authorId = this.currentMemberId() ?? this.members()[0].id;
    const comment: WorkComment = {
      id: crypto.randomUUID(),
      authorId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    this.updateCard(cardId, { comments: [...card.comments, comment] });
  }

  logTime(cardId: string, minutes: number, note: string): void {
    if (minutes <= 0) return;

    if (environment.useApi) {
      void firstValueFrom(this.workApi.logTime(cardId, minutes, note)).then(entry => {
        this.appendTimeEntry(cardId, entry);
      });
      return;
    }

    const card = this.getCard(cardId);
    if (!card) return;
    const memberId = this.currentMemberId() ?? this.members()[0].id;
    const entry: WorkTimeEntry = {
      id: crypto.randomUUID(),
      memberId,
      minutes,
      note: note.trim(),
      loggedAt: new Date().toISOString(),
    };
    this.updateCard(cardId, {
      timeEntries: [...card.timeEntries, entry],
      trackedMinutes: card.trackedMinutes + minutes,
    });
  }

  deleteCard(cardId: string): void {
    if (environment.useApi) {
      void firstValueFrom(this.workApi.deleteIssue(cardId)).then(() => {
        this.patch({ cards: this.cards().filter(c => c.id !== cardId) });
      });
      return;
    }
    this.patch({ cards: this.cards().filter(c => c.id !== cardId) });
  }

  private appendTimeEntry(cardId: string, entry: WorkTimeEntry): void {
    const card = this.getCard(cardId);
    if (!card) return;
    this.replaceCard({
      ...card,
      timeEntries: [...card.timeEntries, entry],
      trackedMinutes: card.trackedMinutes + entry.minutes,
    });
  }

  private replaceCard(updated: WorkCard): void {
    this.patch({
      cards: this.cards().some(c => c.id === updated.id)
        ? this.cards().map(c => (c.id === updated.id ? updated : c))
        : [...this.cards(), updated],
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
      cards: [],
      labels: [],
      members: [],
      activeTimer: null,
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
      type: c.type ?? ('task' as WorkIssueType),
    }));
    return { ...state, cards, activeTimer: state.activeTimer ?? null };
  }
}

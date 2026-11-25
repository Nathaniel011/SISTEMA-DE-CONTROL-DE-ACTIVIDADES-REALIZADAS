import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Params, Router, RouterLink} from '@angular/router';
import {map} from 'rxjs';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Dialog} from 'primeng/dialog';
import {WorkService} from '../../../core/services/work.service';
import {WorkBoardList, WorkCard, WorkColumnId} from '../work.models';
import {boardDisplayName, WORK_DRAFT_CARD_TITLE} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkIssueCreate} from '../work-issue-create/work-issue-create';
import {WorkKanbanCard} from '../work-kanban-card/work-kanban-card';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {debouncedAction} from '../../../core/timing/debounced-action';

@Component({
  selector: 'app-work-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Button,
    IconField,
    InputIcon,
    InputText,
    Select,
    Dialog,
    WorkCardDrawer,
    WorkIssueCreate,
    WorkKanbanCard,
    WorkPageHeader,
    WorkSkeleton,
  ],
  templateUrl: './work-board.html',
})
export class WorkBoard {
  private route = inject(ActivatedRoute);
  private boardCanvas = viewChild<ElementRef<HTMLDivElement>>('boardCanvas');
  private moveOpener: HTMLElement | null = null;
  router = inject(Router);
  workService = inject(WorkService);

  boardDisplayName = boardDisplayName;

  issueCreate = viewChild(WorkIssueCreate);

  boardId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('boardId') ?? '')),
    { initialValue: '' }
  );
  private readonly params = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});
  search = computed(() => this.params().get('q') ?? '');
  searchDraft = signal(this.search());
  private readonly searchDelay = debouncedAction(270);
  assigneeFilter = computed(() => this.params().get('member'));
  selectedCardId = computed(() => {
    const id = this.params().get('issue');
    return id && this.workService.getCard(id)?.boardId === this.boardId() ? id : null;
  });
  drawerOpen = computed(() => !!this.selectedCardId());
  loadingCards = signal(true);
  boardLoadError = signal(false);
  moveError = signal('');
  moveNotice = signal('');
  movingCard = signal(false);
  newListName = signal('');
  addingList = signal(false);
  editingListId = signal<string | null>(null);
  editingListName = signal('');
  draggedCardId = signal<string | null>(null);
  dropTarget = signal<string | null>(null);
  moveCardId = signal<string | null>(null);
  moveTarget = signal<string | null>(null);

  board = computed(() => this.workService.getBoard(this.boardId()));
  lists = computed(() => this.workService.getBoardLists(this.boardId()));
  filteredCards = computed(() => this.workService.filterIssues(this.workService.cards(), 'all', this.boardId(), this.search())
    .filter(card => (!this.assigneeFilter() || card.assigneeId === this.assigneeFilter())
      && (card.title !== WORK_DRAFT_CARD_TITLE || card.id === this.selectedCardId())));
  columns = computed(() => {
    const lists = this.lists();
    const unlisted: WorkCard[] = [];
    const cardsByList = new Map<string, WorkCard[]>(lists.map(list => [list.id, []]));
    for (const card of this.filteredCards()) (cardsByList.get(card.boardListId ?? '') ?? unlisted).push(card);
    const columns: {list: WorkBoardList | null; cards: WorkCard[]; state?: WorkColumnId}[] = [];
    if (unlisted.length) columns.push({list: null, cards: unlisted});
    for (const list of lists) {
      columns.push({list, cards: (cardsByList.get(list.id) ?? []).sort((a, b) => a.order - b.order),
        state: this.workService.getBoardListState(list.id)});
    }
    return columns;
  });
  destinations = computed(() => {
    const lists = this.lists();
    const result = new Map<string, WorkBoardList[]>();
    for (const card of this.filteredCards()) {
      if (!this.workService.canEditCard(card)) continue;
      const allowed = new Set(this.workService.allowedStates(card));
      const targets = lists.filter(list => {
        const state = this.workService.getBoardListState(list.id);
        return list.id !== card.boardListId && (!state || state === card.columnId || allowed.has(state));
      });
      if (targets.length) result.set(card.id, targets);
    }
    return result;
  });
  dropDestinations = computed(() => new Set((this.destinations().get(this.draggedCardId() ?? '') ?? []).map(list => list.id)));
  moveOptions = computed(() => this.destinations().get(this.moveCardId() ?? '') ?? []);
  memberFilterOptions = computed(() => [
    {label: 'Responsable', value: null},
    ...this.workService.members().map(member => ({label: member.name, value: member.id})),
  ]);

  constructor() {
    effect(() => {
      const board = this.board();
      if (board) untracked(() => void this.loadBoardCards(board.id));
    });
    effect(() => {
      this.boardId();
      const query = this.search();
      untracked(() => {
        this.searchDelay.cancel();
        this.searchDraft.set(query);
      });
    });
    effect(() => {
      this.boardId();
      untracked(() => {
        this.cancelAddList();
        this.cancelRenameList();
        this.endDrag();
        this.moveCardId.set(null);
        this.moveNotice.set('');
        this.moveError.set('');
      });
    });
  }

  async loadBoardCards(boardId: string): Promise<void> {
    this.loadingCards.set(true);
    this.boardLoadError.set(false);
    this.workService.recordBoardVisit(boardId);
    try {
      await this.workService.ensureBoardCards(boardId);
    } catch {
      if (this.boardId() === boardId) this.boardLoadError.set(true);
    } finally {
      if (this.boardId() === boardId) this.loadingCards.set(false);
    }
  }

  updateSearch(query: string): void {
    this.searchDraft.set(query);
    this.searchDelay.schedule(() => this.updateQuery({q: query || null}, true));
  }

  openCard(card: WorkCard): void {
    this.updateQuery({issue: card.id});
  }

  openCreateCard(listId?: string): void {
    const list = listId
      ? this.lists().find(l => l.id === listId)
      : this.lists()[0];
    this.issueCreate()?.open(this.boardId(), list?.id, true);
  }

  onDrawerVisibleChange(open: boolean): void {
    if (!open) this.updateQuery({issue: null}, true);
  }

  updateQuery(queryParams: Params, replaceUrl = false): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl});
  }

  startAddList(): void {
    this.addingList.set(true);
    this.newListName.set('');
  }

  cancelAddList(): void {
    this.addingList.set(false);
    this.newListName.set('');
  }

  async saveNewList(): Promise<void> {
    const name = this.newListName().trim();
    if (!name) return;
    await this.workService.createBoardList(this.boardId(), name);
    this.cancelAddList();
  }

  startRenameList(list: WorkBoardList): void {
    this.editingListId.set(list.id);
    this.editingListName.set(list.name);
  }

  cancelRenameList(): void {
    this.editingListId.set(null);
    this.editingListName.set('');
  }

  async saveRenameList(listId: string): Promise<void> {
    const name = this.editingListName().trim();
    if (!name) return;
    await this.workService.renameBoardList(this.boardId(), listId, name);
    this.cancelRenameList();
  }

  startDrag(event: DragEvent, card: WorkCard): void {
    if (!event.dataTransfer || this.movingCard() || !this.destinations().has(card.id)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.workService.getIssueKey(card));
    this.draggedCardId.set(card.id);
  }

  endDrag(): void {
    this.draggedCardId.set(null);
    this.dropTarget.set(null);
  }

  allowDrop(event: DragEvent, listId: string): void {
    if (!this.dropDestinations().has(listId)) return;
    event.preventDefault();
    this.dropTarget.set(listId);
  }

  drop(event: DragEvent, listId: string): void {
    const id = this.draggedCardId();
    if (!id) return;
    event.preventDefault();
    this.endDrag();
    void this.moveToList(id, listId);
  }

  openMove(card: WorkCard, event: Event): void {
    this.moveOpener = event.currentTarget as HTMLElement;
    this.moveError.set('');
    this.moveTarget.set(null);
    this.moveCardId.set(card.id);
  }

  closeMove(): void {
    if (this.movingCard()) return;
    this.moveCardId.set(null);
    this.moveError.set('');
  }

  restoreMoveFocus(): void {
    if (this.moveOpener?.isConnected) this.moveOpener.focus();
    else if (this.moveOpener) this.boardCanvas()?.nativeElement.focus();
    this.moveOpener = null;
  }

  confirmMove(): void {
    const cardId = this.moveCardId();
    const listId = this.moveTarget();
    if (cardId && listId) void this.moveToList(cardId, listId);
  }

  private async moveToList(cardId: string, listId: string): Promise<void> {
    const card = this.workService.getCard(cardId);
    const boardId = this.boardId();
    const target = this.destinations().get(cardId)?.find(list => list.id === listId);
    if (!card || card.boardId !== boardId || !target || this.movingCard()) return;
    this.moveError.set('');
    this.moveNotice.set('');
    this.movingCard.set(true);
    try {
      await this.workService.moveCardToList(card.id, listId);
      if (this.boardId() === boardId) {
        this.moveCardId.set(null);
        this.moveNotice.set(`${this.workService.getIssueKey(card)} se movió a ${target.name}.`);
      }
    } catch {
      if (this.boardId() === boardId) this.moveError.set('No se pudo mover la incidencia. Revisa sus permisos y el estado de destino.');
    } finally {
      this.movingCard.set(false);
    }
  }
}

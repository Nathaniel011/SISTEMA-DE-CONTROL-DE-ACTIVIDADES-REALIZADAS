import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {map} from 'rxjs';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {DragDropModule} from 'primeng/dragdrop';
import {Avatar} from 'primeng/avatar';
import {WorkService} from '../../../core/services/work.service';
import {WorkBoardList, WorkCard} from '../work.models';
import {
  formatWorkDate,
  formatWorkMinutes,
  isDueSoon,
  isOverdue,
  priorityMeta,
  getTimeOverrunStatus,
  getTimeOverrunColor,
  boardDisplayName,
} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkBoardSwitcher} from '../work-board-switcher/work-board-switcher';

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
    DragDropModule,
    Avatar,
    WorkCardDrawer,
    WorkBoardSwitcher,
  ],
  templateUrl: './work-board.html',
})
export class WorkBoard {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  workService = inject(WorkService);

  boardDisplayName = boardDisplayName;

  boardSwitcher = viewChild(WorkBoardSwitcher);

  boardId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('boardId') ?? '')),
    { initialValue: '' }
  );
  search = signal('');
  assigneeFilter = signal<string | null>(null);
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);
  newListName = signal('');
  addingList = signal(false);
  editingListId = signal<string | null>(null);
  editingListName = signal('');
  draggedCardId = signal<string | null>(null);

  board = computed(() => this.workService.getBoard(this.boardId()));
  lists = computed(() => this.workService.getBoardLists(this.boardId()));

  memberFilterOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.workService.members().map(m => ({ label: m.name, value: m.id })),
  ]);

  constructor() {
    effect(() => {
      const id = this.boardId();
      if (id) {
        this.workService.recordBoardVisit(id);
      }
    });
  }

  openBoardSwitcher(): void {
    this.boardSwitcher()?.open(this.boardId());
  }

  cardsForList(list: WorkBoardList): WorkCard[] {
    let cards = this.workService.getCardsInList(this.boardId(), list.id);
    const query = this.search().trim().toLowerCase();
    const assignee = this.assigneeFilter();

    if (query) {
      cards = cards.filter(
        c =>
          c.title.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query)
      );
    }
    if (assignee) {
      cards = cards.filter(c => c.assigneeId === assignee);
    }
    return cards;
  }

  openCard(card: WorkCard): void {
    this.selectedCardId.set(card.id);
    this.drawerOpen.set(true);
  }

  async openCreateCard(listId?: string): Promise<void> {
    const list = listId
      ? this.lists().find(l => l.id === listId)
      : this.lists()[0];
    if (!list) return;
    try {
      const card = await this.workService.createDraftCard({
        boardId: this.boardId(),
        boardListId: list.id,
      });
      this.selectedCardId.set(card.id);
      this.drawerOpen.set(true);
    } catch {
      // Sin feedback dedicado; el usuario puede reintentar.
    }
  }

  onDrawerVisibleChange(open: boolean): void {
    this.drawerOpen.set(open);
    if (!open) {
      this.selectedCardId.set(null);
    }
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

  onDragStart(card: WorkCard): void {
    this.draggedCardId.set(card.id);
  }

  onDrop(listId: string): void {
    const cardId = this.draggedCardId();
    if (cardId) {
      this.workService.moveCardToList(cardId, listId);
    }
    this.draggedCardId.set(null);
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  priorityMeta = priorityMeta;
  isDueSoon = isDueSoon;
  isOverdue = isOverdue;
  getTimeOverrunStatus = getTimeOverrunStatus;
  getTimeOverrunColor = getTimeOverrunColor;
}

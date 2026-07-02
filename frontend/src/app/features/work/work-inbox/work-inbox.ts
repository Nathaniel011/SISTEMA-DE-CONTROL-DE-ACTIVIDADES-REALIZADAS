import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {map} from 'rxjs';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {Select} from 'primeng/select';
import {DragDropModule} from 'primeng/dragdrop';
import {Avatar} from 'primeng/avatar';
import {WorkService} from '../../../core/services/work.service';
import {WorkCard, WorkColumnId} from '../work.models';
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

const SECRETARY_COLUMNS: { id: WorkColumnId; title: string; icon: string }[] = [
  { id: 'registered', title: ' Registrada', icon: 'pi pi-inbox' },
  { id: 'in_assignment', title: ' En Asignación', icon: 'pi pi-arrows-alt' },
  { id: 'todo', title: 'Pendiente', icon: 'pi pi-list' },
];

@Component({
  selector: 'app-work-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Button,
    Dialog,
    Select,
    DragDropModule,
    Avatar,
    WorkCardDrawer,
  ],
  templateUrl: './work-inbox.html',
})
export class WorkInbox {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  workService = inject(WorkService);

  columns = SECRETARY_COLUMNS;
  boardId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('boardId') ?? 'all')),
    { initialValue: 'all' }
  );
  search = signal('');
  assigneeFilter = signal<string | null>(null);
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);
  showAssignDialog = signal(false);
  assigningCardId = signal<string | null>(null);
  selectedBoardId = signal<string | null>(null);
  selectedAssigneeId = signal<string | null>(null);
  assigning = signal(false);
  assignError = signal<string | null>(null);

  boardOptions = computed(() =>
    this.workService.standardBoards().map(b => ({
      label: boardDisplayName(b),
      value: b.id,
    }))
  );

  assignMemberOptions = computed(() => {
    const boardId = this.selectedBoardId();
    if (!boardId) return [];
    const board = this.workService.getBoard(boardId);
    if (!board) return [];
    const boardMembers = this.workService.members().filter(m => board.memberIds.includes(m.id));
    return this.workService
      .staffMembers()
      .filter(m => boardMembers.some(b => b.id === m.id))
      .map(m => ({ label: m.name, value: m.id }));
  });

  canConfirmAssign = computed(
    () => !!this.selectedBoardId() && !!this.selectedAssigneeId() && !this.assigning()
  );

  memberFilterOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.workService.members().map(m => ({ label: m.name, value: m.id })),
  ]);

  cardsForColumn(columnId: WorkColumnId): WorkCard[] {
    const generalId = this.workService.getGeneralBoardId();
    let cards = this.workService.cards();

    if (generalId) {
      cards = cards.filter(c => c.boardId === generalId);
    }

    cards = cards.filter(c => c.columnId === columnId);

    const query = this.search().trim().toLowerCase();
    if (query) {
      cards = cards.filter(
        c =>
          c.title.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query)
      );
    }

    const assignee = this.assigneeFilter();
    if (assignee) {
      cards = cards.filter(c => c.assigneeId === assignee);
    }

    return cards.sort((a, b) => a.order - b.order);
  }

  openCard(card: WorkCard): void {
    this.selectedCardId.set(card.id);
    this.drawerOpen.set(true);
  }

  async openCreateCard(columnId: WorkColumnId): Promise<void> {
    const generalId = this.workService.getGeneralBoardId();
    if (!generalId) return;
    try {
      const card = await this.workService.createDraftCard({
        boardId: generalId,
        columnId,
        incoming: columnId === 'registered',
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

  onDragStart(event: DragEvent, card: WorkCard): void {
    event.dataTransfer?.setData('text/plain', card.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDrop(event: DragEvent, columnId: WorkColumnId): void {
    event.preventDefault();
    const cardId = event.dataTransfer?.getData('text/plain');
    if (cardId) {
      this.workService.moveCard(cardId, columnId);
    }
  }

  openAssignDialog(card: WorkCard): void {
    this.assigningCardId.set(card.id);
    this.selectedBoardId.set(null);
    this.selectedAssigneeId.set(null);
    this.assignError.set(null);
    this.showAssignDialog.set(true);
  }

  closeAssignDialog(): void {
    this.showAssignDialog.set(false);
    this.assigningCardId.set(null);
    this.selectedBoardId.set(null);
    this.selectedAssigneeId.set(null);
    this.assignError.set(null);
  }

  onAssignBoardChange(boardId: string | null): void {
    this.selectedBoardId.set(boardId);
    this.selectedAssigneeId.set(null);
  }

  async saveAssignment(): Promise<void> {
    const cardId = this.assigningCardId();
    const boardId = this.selectedBoardId();
    const assigneeId = this.selectedAssigneeId();
    if (!cardId || !boardId || !assigneeId || this.assigning()) return;

    const lists = this.workService.getBoardLists(boardId);
    const listId = lists.find(l => l.name.toLowerCase() === 'tarea')?.id ?? lists[0]?.id;

    this.assigning.set(true);
    this.assignError.set(null);
    try {
      await this.workService.moveCardToBoard(cardId, boardId, 'todo', undefined, listId);
      await this.workService.updateCardAsync(cardId, { assigneeId });
      this.closeAssignDialog();
    } catch (err) {
      const message =
        err instanceof Error && err.message !== 'update failed'
          ? err.message
          : 'No se pudo asignar. Verifica el tablero y el técnico.';
      this.assignError.set(message);
    } finally {
      this.assigning.set(false);
    }
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  priorityMeta = priorityMeta;
  isDueSoon = isDueSoon;
  isOverdue = isOverdue;
  getTimeOverrunStatus = getTimeOverrunStatus;
  getTimeOverrunColor = getTimeOverrunColor;
}

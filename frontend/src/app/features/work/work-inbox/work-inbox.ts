import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
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
} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';

const SECRETARY_COLUMNS: { id: WorkColumnId; title: string; icon: string }[] = [
  { id: 'registered', title: ' Registrada', icon: 'pi pi-inbox' },
  { id: 'in_assignment', title: ' En Asignación', icon: 'pi pi-arrows-alt' },
  { id: 'todo', title: 'Pendiente', icon: 'pi pi-list' },
];

@Component({
  selector: 'app-work-inbox',
  imports: [
    FormsModule,
    RouterLink,
    Button,
    Dialog,
    DragDropModule,
    Avatar,
    WorkCardDrawer,
  ],
  templateUrl: './work-inbox.html',
})
export class WorkInbox implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  workService = inject(WorkService);

  columns = SECRETARY_COLUMNS;
  boardId = signal('all');
  search = signal('');
  assigneeFilter = signal<string | null>(null);
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);
  quickAddColumn = signal<WorkColumnId | null>(null);
  quickAddTitle = signal('');
  showAssignDialog = signal(false);
  assigningCardId = signal<string | null>(null);
  selectedAssigneeId = signal<string>('');

  memberFilterOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.workService.members().map(m => ({ label: m.name, value: m.id })),
  ]);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.boardId.set(params.get('boardId') ?? 'all');
    });
  }

  cardsForColumn(columnId: WorkColumnId): WorkCard[] {
    let cards = this.workService.cards();
    
    if (this.boardId() !== 'all') {
      cards = cards.filter(c => c.boardId === this.boardId());
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

  startQuickAdd(columnId: WorkColumnId): void {
    this.quickAddColumn.set(columnId);
    this.quickAddTitle.set('');
  }

  cancelQuickAdd(): void {
    this.quickAddColumn.set(null);
    this.quickAddTitle.set('');
  }

  saveQuickAdd(columnId: WorkColumnId): void {
    const title = this.quickAddTitle().trim();
    if (!title) return;
    
    const targetBoardId = this.boardId() !== 'all' ? this.boardId() : this.workService.boards()[0]?.id;
    if (!targetBoardId) return;
    
    this.workService.createCard(targetBoardId, columnId, title);
    this.cancelQuickAdd();
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
    this.selectedAssigneeId.set(card.assigneeId ?? '');
    this.showAssignDialog.set(true);
  }

  closeAssignDialog(): void {
    this.showAssignDialog.set(false);
    this.assigningCardId.set(null);
    this.selectedAssigneeId.set('');
  }

  saveAssignment(): void {
    const cardId = this.assigningCardId();
    if (!cardId) return;
    
    this.workService.updateCard(cardId, {
      assigneeId: this.selectedAssigneeId() || null,
      columnId: 'todo'
    });
    
    this.closeAssignDialog();
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  priorityMeta = priorityMeta;
  isDueSoon = isDueSoon;
  isOverdue = isOverdue;
  getTimeOverrunStatus = getTimeOverrunStatus;
  getTimeOverrunColor = getTimeOverrunColor;
}

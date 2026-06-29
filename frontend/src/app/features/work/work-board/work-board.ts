import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {DragDropModule} from 'primeng/dragdrop';
import {Avatar} from 'primeng/avatar';
import {WorkService} from '../../../core/services/work.service';
import {WORK_COLUMNS, WorkCard, WorkColumnId} from '../work.models';
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

@Component({
  selector: 'app-work-board',
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
  ],
  templateUrl: './work-board.html',
})
export class WorkBoard implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  workService = inject(WorkService);

  columns = WORK_COLUMNS;
  boardId = signal('');
  search = signal('');
  assigneeFilter = signal<string | null>(null);
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);
  quickAddColumn = signal<WorkColumnId | null>(null);
  quickAddTitle = signal('');

  board = computed(() => this.workService.getBoard(this.boardId()));

  memberFilterOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.workService.members().map(m => ({ label: m.name, value: m.id })),
  ]);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.boardId.set(params.get('boardId') ?? '');
    });
  }

  cardsForColumn(columnId: WorkColumnId): WorkCard[] {
    let cards = this.workService.getCardsInColumn(this.boardId(), columnId);
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
    this.workService.createCard(this.boardId(), columnId, title);
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

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  priorityMeta = priorityMeta;
  isDueSoon = isDueSoon;
  isOverdue = isOverdue;
  getTimeOverrunStatus = getTimeOverrunStatus;
  getTimeOverrunColor = getTimeOverrunColor;
}

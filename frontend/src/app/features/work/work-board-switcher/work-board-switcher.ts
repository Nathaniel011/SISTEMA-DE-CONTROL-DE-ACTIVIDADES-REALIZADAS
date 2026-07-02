import {Component, computed, inject, model, signal} from '@angular/core';
import {Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Dialog} from 'primeng/dialog';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {WorkService} from '../../../core/services/work.service';
import {WorkBoard} from '../work.models';
import {boardDisplayName} from '../work.utils';

type BoardTab = 'all' | 'recent';

@Component({
  selector: 'app-work-board-switcher',
  imports: [FormsModule, Dialog, IconField, InputIcon, InputText, Button],
  templateUrl: './work-board-switcher.html',
})
export class WorkBoardSwitcher {
  private router = inject(Router);
  workService = inject(WorkService);

  boardDisplayName = boardDisplayName;

  visible = model(false);
  search = signal('');
  activeTab = signal<BoardTab>('all');
  currentBoardId = signal<string | null>(null);

  filteredBoards = computed(() => {
    const query = this.search().trim().toLowerCase();
    let boards = this.workService.boards();

    if (this.activeTab() === 'recent') {
      const recentIds = this.workService.getRecentBoardIds();
      boards = recentIds
        .map(id => this.workService.getBoard(id))
        .filter((b): b is WorkBoard => !!b);
    }

    const general = this.workService.generalBoard();
    if (general && this.activeTab() === 'all' && !query) {
      const withoutGeneral = boards.filter(b => b.id !== general.id);
      boards = [general, ...withoutGeneral];
    }

    if (!query) {
      return boards;
    }

    return boards.filter(
      b =>
        b.name.toLowerCase().includes(query) ||
        b.key.toLowerCase().includes(query) ||
        (b.description ?? '').toLowerCase().includes(query)
    );
  });

  open(boardId?: string | null): void {
    this.currentBoardId.set(boardId ?? null);
    this.search.set('');
    this.activeTab.set('all');
    this.visible.set(true);
  }

  setTab(tab: BoardTab): void {
    this.activeTab.set(tab);
  }

  openBoard(board: WorkBoard): void {
    this.workService.recordBoardVisit(board.id);
    this.visible.set(false);
    this.router.navigate(['/work/agile', board.id]);
  }

  boardThumbnailClass(board: WorkBoard, index: number): string {
    if (board.type === 'general') {
      return 'work-board-thumb-general';
    }
    const classes = [
      'work-board-thumb-a',
      'work-board-thumb-b',
      'work-board-thumb-c',
      'work-board-thumb-d',
    ];
    return classes[index % classes.length];
  }

  isCurrent(board: WorkBoard): boolean {
    return this.currentBoardId() === board.id;
  }
}

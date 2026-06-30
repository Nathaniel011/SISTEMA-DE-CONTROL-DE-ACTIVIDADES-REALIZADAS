import {Component, computed, inject, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {MultiSelect} from 'primeng/multiselect';
import {FormsModule} from '@angular/forms';
import {Tag} from 'primeng/tag';
import {WorkService} from '../../../core/services/work.service';
import {WorkApiService} from '../../../core/services/work-api.service';
import {firstValueFrom} from 'rxjs';

@Component({
  selector: 'app-work-projects',
  imports: [RouterLink, Button, Dialog, InputText, Textarea, MultiSelect, FormsModule, Tag],
  templateUrl: './work-projects.html',
})
export class WorkProjects {
  workService = inject(WorkService);
  workApi = inject(WorkApiService);
  createDialogOpen = signal(false);
  membersDialogOpen = signal(false);
  selectedBoardId = signal<string | null>(null);
  boardName = signal('');
  boardDescription = signal('');
  selectedMembers = signal<string[]>([]);

  rootBoards = computed(() => this.workService.boards().filter(b => !b.parentBoardId));
  childBoards = computed(() => this.workService.boards());

  childBoardsFor(boardId: string) {
    return this.childBoards().filter(board => board.parentBoardId === boardId);
  }

  memberOptions = computed(() =>
    this.workService.members().map(m => ({ label: m.name, value: m.id }))
  );

  openCreate(): void {
    this.boardName.set('');
    this.boardDescription.set('');
    this.createDialogOpen.set(true);
  }

  save(): void {
    const name = this.boardName().trim();
    if (!name) return;
    this.workService.createBoard({
      name,
      description: this.boardDescription().trim(),
    });
    this.createDialogOpen.set(false);
  }

  openMembersDialog(boardId: string): void {
    const board = this.workService.boards().find(b => b.id === boardId);
    if (!board) return;
    this.selectedBoardId.set(boardId);
    this.selectedMembers.set(board.memberIds);
    this.membersDialogOpen.set(true);
  }

  async saveMembers(): Promise<void> {
    const boardId = this.selectedBoardId();
    if (!boardId) return;

    const currentBoard = this.workService.boards().find(b => b.id === boardId);
    if (!currentBoard) return;

    const actions: { userId: string; action: string }[] = [];
    
    // Members to add
    for (const memberId of this.selectedMembers()) {
      if (!currentBoard.memberIds.includes(memberId)) {
        actions.push({ userId: memberId, action: 'add' });
      }
    }
    
    // Members to remove
    for (const memberId of currentBoard.memberIds) {
      if (!this.selectedMembers().includes(memberId)) {
        actions.push({ userId: memberId, action: 'remove' });
      }
    }

    if (actions.length > 0) {
      await firstValueFrom(this.workApi.updateProjectMembers(boardId, actions));
      await this.workService.loadFromApi();
    }

    this.membersDialogOpen.set(false);
  }

  getBoardMembers(boardId: string) {
    return this.workService.members().filter(m => {
      const board = this.workService.boards().find(b => b.id === boardId);
      return board && board.memberIds.includes(m.id);
    });
  }
}

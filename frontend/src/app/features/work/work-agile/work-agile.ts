import {Component, computed, inject, signal, viewChild} from '@angular/core';

import {Router} from '@angular/router';

import {Button} from 'primeng/button';

import {Checkbox} from 'primeng/checkbox';

import {Dialog} from 'primeng/dialog';

import {InputText} from 'primeng/inputtext';

import {Textarea} from 'primeng/textarea';

import {Tag} from 'primeng/tag';

import {FormsModule} from '@angular/forms';

import {IconField} from 'primeng/iconfield';

import {InputIcon} from 'primeng/inputicon';

import {firstValueFrom} from 'rxjs';

import {WorkService} from '../../../core/services/work.service';

import {WorkApiService} from '../../../core/services/work-api.service';

import {PermissionsService} from '../../../core/services/permissions.service';

import {UsersService} from '../../../core/services/users.service';

import {WorkBoardSwitcher} from '../work-board-switcher/work-board-switcher';

import {WorkBoard} from '../work.models';
import {boardDisplayName} from '../work.utils';



@Component({

  selector: 'app-work-agile',

  standalone: true,

  imports: [

    Button,

    Checkbox,

    Dialog,

    InputText,

    Textarea,

    Tag,

    FormsModule,

    IconField,

    InputIcon,

    WorkBoardSwitcher,

  ],

  templateUrl: './work-agile.html',

})

export class WorkAgile {

  workService = inject(WorkService);

  workApi = inject(WorkApiService);

  usersService = inject(UsersService);

  permissions = inject(PermissionsService);

  private router = inject(Router);

  boardDisplayName = boardDisplayName;

  boardSwitcher = viewChild(WorkBoardSwitcher);



  createDialogOpen = signal(false);

  membersDialogOpen = signal(false);

  selectedBoardId = signal<string | null>(null);

  boardName = signal('');

  boardDescription = signal('');

  selectedMembers = signal<string[]>([]);

  memberSearch = signal('');

  search = signal('');

  savingMembers = signal(false);
  deleteDialogOpen = signal(false);
  boardToDelete = signal<WorkBoard | null>(null);
  deletingBoard = signal(false);



  rootBoards = computed(() => {

    const query = this.search().trim().toLowerCase();

    const general = this.workService.generalBoard();

    let boards = this.workService.boards().filter(b => !b.parentBoardId);

    if (general) {

      boards = [general, ...boards.filter(b => b.id !== general.id)];

    }

    if (!query) return boards;

    return boards.filter(

      b =>

        b.name.toLowerCase().includes(query) ||

        b.key.toLowerCase().includes(query) ||

        (b.description ?? '').toLowerCase().includes(query)

    );

  });



  memberCandidates = computed(() => {

    const query = this.memberSearch().trim().toLowerCase();

    return this.usersService

      .users()

      .filter(user => user.active)

      .filter(user => {

        if (!query) return true;

        const haystack = [user.fullName, user.username, user.email, ...user.roles].join(' ').toLowerCase();

        return haystack.includes(query);

      })

      .sort((a, b) => a.fullName.localeCompare(b.fullName));

  });



  childBoardsFor(boardId: string): WorkBoard[] {

    return this.workService.boards().filter(board => board.parentBoardId === boardId);

  }



  getBoardMembers(boardId: string) {

    const board = this.workService.boards().find(b => b.id === boardId);

    if (!board) return [];

    return this.workService.members().filter(m => board.memberIds.includes(m.id));

  }



  openSwitcher(): void {

    this.boardSwitcher()?.open();

  }



  openBoard(board: WorkBoard): void {

    this.workService.recordBoardVisit(board.id);

    this.router.navigate(['/work/agile', board.id]);

  }



  openCreate(): void {

    this.boardName.set('');

    this.boardDescription.set('');

    this.createDialogOpen.set(true);

  }



  saveBoard(): void {

    const name = this.boardName().trim();

    if (!name) return;

    this.workService.createBoard({ name, description: this.boardDescription().trim() });

    this.createDialogOpen.set(false);

  }



  async openMembersDialog(boardId: string, event: Event): Promise<void> {

    event.stopPropagation();

    const board = this.workService.boards().find(b => b.id === boardId);

    if (!board) return;

    await this.usersService.loadUsers();

    this.selectedBoardId.set(boardId);

    this.selectedMembers.set([...board.memberIds]);

    this.memberSearch.set('');

    this.membersDialogOpen.set(true);

  }



  isMemberSelected(userId: string): boolean {

    return this.selectedMembers().includes(userId);

  }



  toggleMember(userId: string, checked: boolean): void {

    const current = this.selectedMembers();

    if (checked) {

      if (!current.includes(userId)) {

        this.selectedMembers.set([...current, userId]);

      }

      return;

    }

    this.selectedMembers.set(current.filter(id => id !== userId));

  }



  roleLabels(roles: string[]): string {

    return roles.map(role => this.permissions.roleLabel(role)).join(', ');

  }



  async saveMembers(): Promise<void> {
    const boardId = this.selectedBoardId();
    if (!boardId) return;

    const currentBoard = this.workService.boards().find(b => b.id === boardId);
    if (!currentBoard) return;

    const actions: { userId: string; action: string }[] = [];

    for (const memberId of this.selectedMembers()) {
      if (!currentBoard.memberIds.includes(memberId)) {
        actions.push({ userId: memberId, action: 'add' });
      }
    }

    for (const memberId of currentBoard.memberIds) {
      if (!this.selectedMembers().includes(memberId)) {
        actions.push({ userId: memberId, action: 'remove' });
      }
    }

    if (actions.length === 0) {
      this.membersDialogOpen.set(false);
      return;
    }

    this.savingMembers.set(true);
    try {
      await firstValueFrom(this.workApi.updateBoardMembers(boardId, actions));
      this.workService.patchBoardMembers(boardId, [...this.selectedMembers()]);
      this.membersDialogOpen.set(false);
    } finally {
      this.savingMembers.set(false);
    }
  }

  openDeleteBoardDialog(board: WorkBoard, event: Event): void {
    event.stopPropagation();
    this.boardToDelete.set(board);
    this.deleteDialogOpen.set(true);
  }

  cancelDeleteBoard(): void {
    this.deleteDialogOpen.set(false);
    this.boardToDelete.set(null);
  }

  async executeDeleteBoard(): Promise<void> {
    const board = this.boardToDelete();
    if (!board) return;
    this.deletingBoard.set(true);
    try {
      await this.workService.deleteBoard(board.id);
      this.cancelDeleteBoard();
    } finally {
      this.deletingBoard.set(false);
    }
  }
}



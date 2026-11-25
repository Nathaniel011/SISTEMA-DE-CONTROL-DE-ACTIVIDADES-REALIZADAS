import {Component, computed, effect, inject, signal, untracked} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';

import {ActivatedRoute, Router, RouterLink} from '@angular/router';

import {Button} from 'primeng/button';

import {Checkbox} from 'primeng/checkbox';

import {Dialog} from 'primeng/dialog';

import {InputText} from 'primeng/inputtext';

import {Textarea} from 'primeng/textarea';

import {FormsModule} from '@angular/forms';

import {IconField} from 'primeng/iconfield';

import {InputIcon} from 'primeng/inputicon';

import {firstValueFrom} from 'rxjs';

import {WorkService} from '../../../core/services/work.service';

import {WorkApiService} from '../../../core/services/work-api.service';

import {PermissionsService} from '../../../core/services/permissions.service';

import {UsersService} from '../../../core/services/users.service';

import {WorkPageHeader} from '../work-page-header/work-page-header';

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


    FormsModule,

    IconField,

    InputIcon,

    RouterLink,
    WorkPageHeader,

  ],

  templateUrl: './work-agile.html',

})

export class WorkAgile {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});

  workService = inject(WorkService);

  workApi = inject(WorkApiService);

  usersService = inject(UsersService);

  permissions = inject(PermissionsService);

  boardDisplayName = boardDisplayName;

  retry(): void {
    void this.workService.loadFromApi().catch(() => undefined);
  }



  createDialogOpen = signal(false);
  creatingBoard = signal(false);
  createBoardError = signal('');

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
  memberLoadError = signal(false);
  actionError = signal('');

  constructor() {
    effect(() => {
      const id = this.query().get('equipo');
      if (!id || !this.workService.canManageBoardMembers() || !this.workService.getBoard(id)) return;
      untracked(() => {
        this.openMembersDialog(id);
        void this.router.navigate([], {relativeTo: this.route, queryParams: {equipo: null}, queryParamsHandling: 'merge', replaceUrl: true});
      });
    });
  }



  projects = computed(() => {
    const query = this.search().trim().toLowerCase();
    const general = this.workService.generalBoard();
    const projects = general ? [...this.workService.standardBoards(), general] : this.workService.standardBoards();
    return projects.filter(project =>
      [boardDisplayName(project), project.key, project.description ?? ''].join(' ').toLowerCase().includes(query),
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



  getBoardMembers(boardId: string) {

    const board = this.workService.boards().find(b => b.id === boardId);

    if (!board) return [];

    return this.workService.members().filter(m => board.memberIds.includes(m.id));

  }



  openCreate(): void {

    this.boardName.set('');

    this.boardDescription.set('');

    this.createBoardError.set('');
    this.createDialogOpen.set(true);

  }



  async saveBoard(): Promise<void> {

    const name = this.boardName().trim();

    if (!name || this.creatingBoard()) return;
    this.creatingBoard.set(true);
    this.createBoardError.set('');
    try {
      await this.workService.createBoard({name, description: this.boardDescription().trim()});
      this.createDialogOpen.set(false);
    } catch {
      this.createBoardError.set('No se pudo crear el proyecto. Puedes volver a intentarlo con los mismos datos.');
    } finally {
      this.creatingBoard.set(false);
    }

  }



  openMembersDialog(boardId: string): void {
    const board = this.workService.boards().find(b => b.id === boardId);
    if (!board) return;
    this.selectedBoardId.set(boardId);
    this.selectedMembers.set([...board.memberIds]);
    this.memberSearch.set('');
    this.actionError.set('');
    this.membersDialogOpen.set(true);
    void this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    this.memberLoadError.set(false);
    try {
      await this.usersService.loadUsers();
    } catch {
      this.memberLoadError.set(true);
    }
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
    if (!boardId || this.savingMembers() || this.memberLoadError() || this.usersService.loading()) return;

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
    this.actionError.set('');
    try {
      const updated = await firstValueFrom(this.workApi.updateBoardMembers(boardId, actions));
      this.workService.patchBoardMembers(boardId, updated.memberIds);
      this.membersDialogOpen.set(false);
    } catch {
      this.actionError.set('No se pudieron guardar los miembros del proyecto.');
    } finally {
      this.savingMembers.set(false);
    }
  }

  openDeleteBoardDialog(board: WorkBoard): void {
    this.actionError.set('');
    this.boardToDelete.set(board);
    this.deleteDialogOpen.set(true);
  }

  cancelDeleteBoard(): void {
    this.deleteDialogOpen.set(false);
    this.boardToDelete.set(null);
  }

  async executeDeleteBoard(): Promise<void> {
    const board = this.boardToDelete();
    if (!board || this.deletingBoard()) return;
    this.deletingBoard.set(true);
    this.actionError.set('');
    try {
      await this.workService.deleteBoard(board.id);
      this.cancelDeleteBoard();
    } catch {
      this.actionError.set('No se pudo eliminar el proyecto.');
    } finally {
      this.deletingBoard.set(false);
    }
  }
}



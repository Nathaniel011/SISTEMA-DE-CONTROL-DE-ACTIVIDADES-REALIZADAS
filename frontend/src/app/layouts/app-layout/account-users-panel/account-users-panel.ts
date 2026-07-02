import {DatePipe} from '@angular/common';
import {Component, inject, OnInit, output, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Message} from 'primeng/message';
import {Tag} from 'primeng/tag';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {UsersService} from '../../../core/services/users.service';
import {PermissionsService} from '../../../core/services/permissions.service';
import {UserRecord} from '../../../features/users/users.models';
import {UsersForm} from '../../../features/users/users-form/users-form';

@Component({
  selector: 'app-account-users-panel',
  imports: [
    FormsModule,
    Button,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Message,
    Tag,
    ToggleSwitch,
    DatePipe,
    UsersForm,
  ],
  templateUrl: './account-users-panel.html',
})
export class AccountUsersPanel implements OnInit {
  protected readonly usersService = inject(UsersService);
  permissions = inject(PermissionsService);

  back = output<void>();

  formOpen = signal(false);
  formMode = signal<'create' | 'edit' | 'view'>('create');
  selectedUserId = signal('');
  flashPassword = signal<string | null>(null);
  deleteError = signal<string | null>(null);
  deleteDialogOpen = signal(false);
  userToDelete = signal<UserRecord | null>(null);
  deletingUser = signal(false);

  ngOnInit(): void {
    void this.usersService.loadUsers();
  }

  onSearch(value: string): void {
    this.usersService.setSearchTerm(value);
  }

  toggleStatus(id: string, active: boolean): void {
    void this.usersService.toggleUserStatus(id, active);
  }

  roleLabel(role: string): string {
    return this.permissions.roleLabel(role);
  }

  openCreate(): void {
    this.flashPassword.set(null);
    this.formMode.set('create');
    this.selectedUserId.set('');
    this.formOpen.set(true);
  }

  openUser(user: UserRecord, mode: 'view' | 'edit'): void {
    this.flashPassword.set(null);
    this.formMode.set(mode);
    this.selectedUserId.set(user.id);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  onUserSaved(user: UserRecord): void {
    this.formOpen.set(false);
    if (user.temporaryPassword) {
      this.flashPassword.set(user.temporaryPassword);
    }
    void this.usersService.loadUsers();
  }

  openDeleteUserDialog(user: UserRecord): void {
    this.deleteError.set(null);
    this.userToDelete.set(user);
    this.deleteDialogOpen.set(true);
  }

  cancelDeleteUser(): void {
    this.deleteDialogOpen.set(false);
    this.userToDelete.set(null);
  }

  async executeDeleteUser(): Promise<void> {
    const user = this.userToDelete();
    if (!user) return;
    this.deleteError.set(null);
    this.deletingUser.set(true);
    try {
      await this.usersService.deleteUser(user.id);
      this.cancelDeleteUser();
    } catch {
      this.deleteError.set('No se pudo eliminar el usuario.');
      this.cancelDeleteUser();
    } finally {
      this.deletingUser.set(false);
    }
  }
}

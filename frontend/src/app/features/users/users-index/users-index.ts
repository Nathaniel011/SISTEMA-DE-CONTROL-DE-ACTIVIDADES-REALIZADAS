import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {DatePipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Paginator} from 'primeng/paginator';
import {Tag} from 'primeng/tag';
import {TableModule} from 'primeng/table';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {UsersService} from '../../../core/services/users.service';
import {PermissionsService} from '../../../core/services/permissions.service';
import {UsersSortField} from '../users.models';

@Component({
  selector: 'nv-users-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Card,
    Button,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    Tag,
    TableModule,
    ToggleSwitch,
    DatePipe,
  ],
  templateUrl: './users-index.html',
})
export class UsersIndex implements OnInit {
  protected readonly usersService = inject(UsersService);
  protected readonly permissions = inject(PermissionsService);

  ngOnInit(): void {
    void this.usersService.loadUsers();
  }

  onSearch(value: string): void {
    this.usersService.setSearchTerm(value);
  }

  onSort(field: UsersSortField): void {
    this.usersService.toggleSort(field);
  }

  onPageChange(event: {page?: number; rows?: number}): void {
    this.usersService.setPage(event.page ?? 0, event.rows ?? this.usersService.rows());
  }

  toggleStatus(id: string, active: boolean): void {
    void this.usersService.toggleUserStatus(id, active);
  }

  roleLabel(role: string): string {
    return this.permissions.roleLabel(role);
  }

  sortIcon(field: UsersSortField): string {
    if (this.usersService.sortField() !== field) {
      return 'pi pi-sort-alt text-surface-400';
    }
    return this.usersService.sortDirection() === 'asc'
      ? 'pi pi-sort-amount-up-alt text-primary'
      : 'pi pi-sort-amount-down text-primary';
  }
}

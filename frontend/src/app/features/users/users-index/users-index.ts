import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
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
import {UsersStore} from '../../../stores/users/users.store';
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
  ],
  templateUrl: './users-index.html',
})
export class UsersIndex {
  protected readonly store = inject(UsersStore);

  onSearch(value: string): void {
    this.store.setSearchTerm(value);
  }

  onSort(field: UsersSortField): void {
    this.store.toggleSort(field);
  }

  onPageChange(event: {page?: number; rows?: number}): void {
    this.store.setPage(event.page ?? 0, event.rows ?? this.store.rows());
  }

  toggleStatus(id: number, active: boolean): void {
    this.store.toggleUserStatus(id, active);
  }

  sortIcon(field: UsersSortField): string {
    if (this.store.sortField() !== field) {
      return 'pi pi-sort-alt text-surface-400';
    }
    return this.store.sortDirection() === 'asc'
      ? 'pi pi-sort-amount-up-alt text-primary'
      : 'pi pi-sort-amount-down text-primary';
  }
}

import {HttpClient} from '@angular/common/http';
import {computed, inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {WorkService} from './work.service';
import {
  SortDirection,
  USER_ROLE_OPTIONS,
  UserFormPayload,
  UserRecord,
  UsersSortField,
} from '../../features/users/users.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private workService = inject(WorkService);
  private base = environment.apiUrl;

  private usersState = signal<UserRecord[]>(environment.useApi ? [] : this.seedUsers());
  private searchTermState = signal('');
  private pageState = signal(0);
  private rowsState = signal(25);
  private sortFieldState = signal<UsersSortField>('fullName');
  private sortDirectionState = signal<SortDirection>('asc');
  private loadingState = signal(false);

  roleOptions = USER_ROLE_OPTIONS;
  users = computed(() => this.usersState());
  searchTerm = computed(() => this.searchTermState());
  page = computed(() => this.pageState());
  rows = computed(() => this.rowsState());
  sortField = computed(() => this.sortFieldState());
  sortDirection = computed(() => this.sortDirectionState());
  loading = computed(() => this.loadingState());

  filteredUsers = computed(() => {
    const searchTerm = this.searchTermState().trim().toLowerCase();
    const users = this.usersState();
    if (!searchTerm) return users;
    return users.filter(user =>
      [user.fullName, user.username, user.email, user.roles.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    );
  });

  sortedUsers = computed(() => {
    const field = this.sortFieldState();
    const direction = this.sortDirectionState();
    return [...this.filteredUsers()].sort((left, right) => {
      let comparison = 0;
      if (field === 'status') {
        comparison = left.active === right.active ? 0 : left.active ? 1 : -1;
      } else {
        comparison = String(left[field]).localeCompare(String(right[field]));
      }
      return direction === 'asc' ? comparison : comparison * -1;
    });
  });

  pagedUsers = computed(() => {
    const offset = this.pageState() * this.rowsState();
    return this.sortedUsers().slice(offset, offset + this.rowsState());
  });

  totalRecords = computed(() => this.sortedUsers().length);

  async loadUsers(): Promise<void> {
    if (!environment.useApi) return;
    this.loadingState.set(true);
    try {
      const users = await firstValueFrom(this.http.get<UserRecord[]>(`${this.base}/api/users`));
      this.usersState.set(users.map(u => this.mapUser(u)));
    } finally {
      this.loadingState.set(false);
    }
  }

  getUserById(id: string): UserRecord | undefined {
    return this.usersState().find(user => user.id === id);
  }

  async createUser(payload: UserFormPayload): Promise<UserRecord> {
    if (!environment.useApi) {
      return this.createUserLocal(payload);
    }
    const created = await firstValueFrom(
      this.http.post<UserRecord & { temporaryPassword?: string }>(`${this.base}/api/users`, payload)
    );
    const user = this.mapUser(created);
    if (created.temporaryPassword) {
      user.temporaryPassword = created.temporaryPassword;
    }
    this.usersState.update(users => [user, ...users]);
    this.syncWorkMember(user);
    return user;
  }

  async updateUser(id: string, payload: UserFormPayload): Promise<UserRecord> {
    if (!environment.useApi) {
      this.updateUserLocal(id, payload);
      return this.getUserById(id)!;
    }
    const updated = await firstValueFrom(
      this.http.put<UserRecord>(`${this.base}/api/users/${id}`, payload)
    );
    const user = this.mapUser(updated);
    this.usersState.update(users => users.map(u => (u.id === id ? user : u)));
    this.syncWorkMember(user);
    return user;
  }

  async toggleUserStatus(id: string, active: boolean): Promise<void> {
    if (!environment.useApi) {
      this.usersState.update(users => users.map(u => (u.id === id ? {...u, active} : u)));
      return;
    }
    const updated = await firstValueFrom(
      this.http.patch<UserRecord>(`${this.base}/api/users/${id}/active`, { active })
    );
    const user = this.mapUser(updated);
    this.usersState.update(users => users.map(u => (u.id === id ? user : u)));
  }

  async deleteUser(id: string): Promise<void> {
    if (!environment.useApi) {
      this.usersState.update(users => users.filter(u => u.id !== id));
      return;
    }
    await firstValueFrom(this.http.delete<void>(`${this.base}/api/users/${id}`));
    this.usersState.update(users => users.filter(u => u.id !== id));
    this.workService.patchMembers(this.workService.members().filter(m => m.id !== id));
  }

  private syncWorkMember(user: UserRecord): void {
    const member = {
      id: user.id,
      name: user.fullName,
      initials: user.fullName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
      role: user.roles[0] ?? 'STAFF',
      roles: user.roles,
    };
    const existing = this.workService.members().some(m => m.id === user.id);
    const members = existing
      ? this.workService.members().map(m => (m.id === user.id ? member : m))
      : [...this.workService.members(), member];
    this.workService.patchMembers(members);
  }

  setSearchTerm(value: string): void {
    this.searchTermState.set(value);
    this.pageState.set(0);
  }

  toggleSort(field: UsersSortField): void {
    if (this.sortFieldState() === field) {
      this.sortDirectionState.set(this.sortDirectionState() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortFieldState.set(field);
      this.sortDirectionState.set(field === 'status' ? 'desc' : 'asc');
    }
    this.pageState.set(0);
  }

  setPage(page: number, rows: number): void {
    this.pageState.set(page);
    this.rowsState.set(rows);
  }

  private createUserLocal(payload: UserFormPayload): UserRecord {
    const nextId = crypto.randomUUID();
    const user: UserRecord = {
      id: nextId,
      fullName: payload.fullName,
      username: this.generateUsername(payload.fullName),
      email: payload.email,
      roles: payload.roles,
      active: payload.active,
      createdAt: new Date().toISOString(),
      lastAccess: 'Pendiente',
    };
    this.usersState.update(users => [user, ...users]);
    return user;
  }

  private updateUserLocal(id: string, payload: UserFormPayload): void {
    this.usersState.update(users =>
      users.map(user =>
        user.id === id
          ? {...user, fullName: payload.fullName, email: payload.email, roles: payload.roles, active: payload.active}
          : user
      )
    );
  }

  private mapUser(user: UserRecord & { temporaryPassword?: string }): UserRecord {
    return {
      id: String(user.id),
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      roles: user.roles ?? [],
      active: user.active,
      createdAt: user.createdAt ?? new Date().toISOString(),
      lastAccess: user.lastAccess ?? 'Pendiente',
      temporaryPassword: user.temporaryPassword,
    };
  }

  private generateUsername(fullName: string): string {
    const parts = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const candidate = `${parts[0]?.charAt(0) ?? 'u'}${parts[parts.length - 1] ?? 'user'}`;
    return candidate.replace(/[^a-z0-9]/g, '');
  }

  private seedUsers(): UserRecord[] {
    return [
      { id: '1', fullName: 'Ana Rojas', username: 'arojas', email: 'ana.rojas@scar.local', roles: ['ADMIN'], active: true, createdAt: '2026-01-05', lastAccess: '2026-04-10 08:10' },
      { id: '2', fullName: 'Luis Mendoza', username: 'lmendoza', email: 'luis.mendoza@scar.local', roles: ['CHIEF'], active: true, createdAt: '2026-01-18', lastAccess: '2026-04-11 17:40' },
    ];
  }
}

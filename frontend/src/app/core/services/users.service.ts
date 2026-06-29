import {computed, Injectable, signal} from '@angular/core';
import {SortDirection, USER_ROLE_OPTIONS, UserFormPayload, UserRecord, UsersSortField} from '../../features/users/users.models';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private usersState = signal<UserRecord[]>([
    {
      id: 1,
      fullName: 'Ana Rojas',
      username: 'arojas',
      email: 'ana.rojas@scar.local',
      roles: ['Administrador'],
      active: true,
      createdAt: '2026-01-05',
      lastAccess: '2026-04-10 08:10',
    },
    {
      id: 2,
      fullName: 'Luis Mendoza',
      username: 'lmendoza',
      email: 'luis.mendoza@scar.local',
      roles: ['Supervisor', 'Operador'],
      active: true,
      createdAt: '2026-01-18',
      lastAccess: '2026-04-11 17:40',
    },
    {
      id: 3,
      fullName: 'Carla Flores',
      username: 'cflores',
      email: 'carla.flores@scar.local',
      roles: ['Operador'],
      active: false,
      createdAt: '2026-02-02',
      lastAccess: '2026-04-02 12:24',
    },
    {
      id: 4,
      fullName: 'Marco Aguilar',
      username: 'maguilar',
      email: 'marco.aguilar@scar.local',
      roles: ['Supervisor'],
      active: true,
      createdAt: '2026-02-10',
      lastAccess: '2026-04-11 09:12',
    },
    {
      id: 5,
      fullName: 'Valeria Peña',
      username: 'vpena',
      email: 'valeria.pena@scar.local',
      roles: ['Operador'],
      active: true,
      createdAt: '2026-02-12',
      lastAccess: '2026-04-09 16:08',
    },
    {
      id: 6,
      fullName: 'Pablo Chávez',
      username: 'pchavez',
      email: 'pablo.chavez@scar.local',
      roles: ['Supervisor'],
      active: false,
      createdAt: '2026-02-19',
      lastAccess: '2026-03-28 11:30',
    },
    {
      id: 7,
      fullName: 'Mónica Vargas',
      username: 'mvargas',
      email: 'monica.vargas@scar.local',
      roles: ['Administrador', 'Supervisor'],
      active: true,
      createdAt: '2026-03-01',
      lastAccess: '2026-04-12 07:55',
    },
    {
      id: 8,
      fullName: 'Diego Castro',
      username: 'dcastro',
      email: 'diego.castro@scar.local',
      roles: ['Operador'],
      active: true,
      createdAt: '2026-03-08',
      lastAccess: '2026-04-08 10:20',
    },
    {
      id: 9,
      fullName: 'Julia Salazar',
      username: 'jsalazar',
      email: 'julia.salazar@scar.local',
      roles: ['Supervisor', 'Operador'],
      active: true,
      createdAt: '2026-03-15',
      lastAccess: '2026-04-07 15:40',
    },
    {
      id: 10,
      fullName: 'Renzo Paredes',
      username: 'rparedes',
      email: 'renzo.paredes@scar.local',
      roles: ['Operador'],
      active: false,
      createdAt: '2026-03-21',
      lastAccess: '2026-03-29 09:05',
    },
  ]);
  private searchTermState = signal('');
  private pageState = signal(0);
  private rowsState = signal(25);
  private sortFieldState = signal<UsersSortField>('fullName');
  private sortDirectionState = signal<SortDirection>('asc');

  roleOptions = USER_ROLE_OPTIONS;
  users = computed(() => this.usersState());
  searchTerm = computed(() => this.searchTermState());
  page = computed(() => this.pageState());
  rows = computed(() => this.rowsState());
  sortField = computed(() => this.sortFieldState());
  sortDirection = computed(() => this.sortDirectionState());

  filteredUsers = computed(() => {
    const searchTerm = this.searchTermState().trim().toLowerCase();
    const users = this.usersState();

    if (!searchTerm) {
      return users;
    }

    return users.filter((user) =>
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
        comparison = left[field].localeCompare(right[field]);
      }

      return direction === 'asc' ? comparison : comparison * -1;
    });
  });

  pagedUsers = computed(() => {
    const page = this.pageState();
    const rows = this.rowsState();
    const offset = page * rows;

    return this.sortedUsers().slice(offset, offset + rows);
  });

  totalRecords = computed(() => this.sortedUsers().length);

  setSearchTerm(value: string): void {
    this.searchTermState.set(value);
    this.pageState.set(0);
  }

  setSort(value: `${UsersSortField}:${SortDirection}`): void {
    const [field, direction] = value.split(':') as [UsersSortField, SortDirection];
    this.sortFieldState.set(field);
    this.sortDirectionState.set(direction);
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

  getUserById(id: number): UserRecord | undefined {
    return this.usersState().find((user) => user.id === id);
  }

  createUser(payload: UserFormPayload): UserRecord {
    const nextId = Math.max(...this.usersState().map((user) => user.id), 0) + 1;
    const username = this.generateUsername(payload.fullName, nextId);
    const user: UserRecord = {
      id: nextId,
      fullName: payload.fullName,
      username,
      email: payload.email,
      roles: payload.roles,
      active: payload.active,
      createdAt: '2026-04-12',
      lastAccess: 'Pendiente',
    };

    this.usersState.update((users) => [user, ...users]);
    return user;
  }

  updateUser(id: number, payload: UserFormPayload): void {
    this.usersState.update((users) =>
      users.map((user) =>
        user.id === id
          ? {
              ...user,
              fullName: payload.fullName,
              email: payload.email,
              roles: payload.roles,
              active: payload.active,
            }
          : user
      )
    );
  }

  toggleUserStatus(id: number, active: boolean): void {
    this.usersState.update((users) =>
      users.map((user) => (user.id === id ? {...user, active} : user))
    );
  }

  private generateUsername(fullName: string, nextId: number): string {
    const base = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const candidate = `${base[0]?.charAt(0) ?? 'u'}${base[base.length - 1] ?? 'user'}`;
    return `${candidate}${nextId}`.replace(/[^a-z0-9]/g, '');
  }
}

import {computed} from '@angular/core';
import {signalStore, withComputed, withMethods, withState, patchState} from '@ngrx/signals';
import {
  SortDirection,
  USER_ROLE_OPTIONS,
  UserFormPayload,
  UserRecord,
  UsersSortField,
} from '../../features/users/users.models';

interface UsersState {
  users: UserRecord[];
  searchTerm: string;
  page: number;
  rows: number;
  sortField: UsersSortField;
  sortDirection: SortDirection;
  loading: boolean;
}

const SEED: UserRecord[] = [
  {id: 1, fullName: 'Ana Rojas', username: 'arojas', email: 'ana.rojas@scar.local', roles: ['Administrador'], active: true, createdAt: '2026-01-05', lastAccess: '2026-04-10 08:10'},
  {id: 2, fullName: 'Luis Mendoza', username: 'lmendoza', email: 'luis.mendoza@scar.local', roles: ['Supervisor', 'Operador'], active: true, createdAt: '2026-01-18', lastAccess: '2026-04-11 17:40'},
  {id: 3, fullName: 'Carla Flores', username: 'cflores', email: 'carla.flores@scar.local', roles: ['Operador'], active: false, createdAt: '2026-02-02', lastAccess: '2026-04-02 12:24'},
  {id: 4, fullName: 'Marco Aguilar', username: 'maguilar', email: 'marco.aguilar@scar.local', roles: ['Supervisor'], active: true, createdAt: '2026-02-10', lastAccess: '2026-04-11 09:12'},
  {id: 5, fullName: 'Valeria Peña', username: 'vpena', email: 'valeria.pena@scar.local', roles: ['Operador'], active: true, createdAt: '2026-02-12', lastAccess: '2026-04-09 16:08'},
  {id: 6, fullName: 'Pablo Chávez', username: 'pchavez', email: 'pablo.chavez@scar.local', roles: ['Supervisor'], active: false, createdAt: '2026-02-19', lastAccess: '2026-03-28 11:30'},
  {id: 7, fullName: 'Mónica Vargas', username: 'mvargas', email: 'monica.vargas@scar.local', roles: ['Administrador', 'Supervisor'], active: true, createdAt: '2026-03-01', lastAccess: '2026-04-12 07:55'},
  {id: 8, fullName: 'Diego Castro', username: 'dcastro', email: 'diego.castro@scar.local', roles: ['Operador'], active: true, createdAt: '2026-03-08', lastAccess: '2026-04-08 10:20'},
  {id: 9, fullName: 'Julia Salazar', username: 'jsalazar', email: 'julia.salazar@scar.local', roles: ['Supervisor', 'Operador'], active: true, createdAt: '2026-03-15', lastAccess: '2026-04-07 15:40'},
  {id: 10, fullName: 'Renzo Paredes', username: 'rparedes', email: 'renzo.paredes@scar.local', roles: ['Operador'], active: false, createdAt: '2026-03-21', lastAccess: '2026-03-29 09:05'},
];

const initialState: UsersState = {
  users: SEED,
  searchTerm: '',
  page: 0,
  rows: 25,
  sortField: 'fullName',
  sortDirection: 'asc',
  loading: false,
};

const generateUsername = (fullName: string, nextId: number): string => {
  const parts = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const candidate = `${parts[0]?.charAt(0) ?? 'u'}${parts[parts.length - 1] ?? 'user'}`;
  return `${candidate}${nextId}`.replace(/[^a-z0-9]/g, '');
};

export const UsersStore = signalStore(
  {providedIn: 'root'},
  withState(initialState),
  withComputed(({users, searchTerm, page, rows, sortField, sortDirection}) => ({
    roleOptions: computed(() => USER_ROLE_OPTIONS),
    sortedUsers: computed(() => {
      const field = sortField();
      const direction = sortDirection();
      const filtered = users().filter(u => {
        const term = searchTerm().trim().toLowerCase();
        if (!term) return true;
        return [u.fullName, u.username, u.email, u.roles.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
      return [...filtered].sort((left, right) => {
        let comparison = 0;
        if (field === 'status') {
          comparison = left.active === right.active ? 0 : left.active ? 1 : -1;
        } else {
          comparison = (left[field] as string).localeCompare(right[field] as string);
        }
        return direction === 'asc' ? comparison : comparison * -1;
      });
    }),
    pagedUsers: computed(() => {
      const p = page();
      const r = rows();
      const offset = p * r;
      const sorted = users().filter(u => {
        const term = searchTerm().trim().toLowerCase();
        if (!term) return true;
        return [u.fullName, u.username, u.email, u.roles.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(term);
      });
      const field = sortField();
      const direction = sortDirection();
      const ordered = [...sorted].sort((left, right) => {
        let comparison = 0;
        if (field === 'status') {
          comparison = left.active === right.active ? 0 : left.active ? 1 : -1;
        } else {
          comparison = (left[field] as string).localeCompare(right[field] as string);
        }
        return direction === 'asc' ? comparison : comparison * -1;
      });
      return ordered.slice(offset, offset + r);
    }),
    totalRecords: computed(() => {
      const term = searchTerm().trim().toLowerCase();
      if (!term) return users().length;
      return users().filter(u =>
        [u.fullName, u.username, u.email, u.roles.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(term),
      ).length;
    }),
    activeCount: computed(() => users().filter(u => u.active).length),
    inactiveCount: computed(() => users().filter(u => !u.active).length),
  })),
  withMethods((store) => {
    // State slices are exposed as Signal<T>; read with `xxx()`.
    const users = store.users;
    const sortField = store.sortField;
    const sortDirection = store.sortDirection;

    return {
      setSearchTerm(value: string): void {
        patchState(store, {searchTerm: value, page: 0});
      },
      setPage(page: number, rows: number): void {
        patchState(store, {page, rows});
      },
      setSort(value: `${UsersSortField}:${SortDirection}`): void {
        const [field, direction] = value.split(':') as [UsersSortField, SortDirection];
        patchState(store, {sortField: field, sortDirection: direction, page: 0});
      },
      toggleSort(field: UsersSortField): void {
        const isSame = sortField() === field;
        const nextDirection: SortDirection = isSame
          ? sortDirection() === 'asc' ? 'desc' : 'asc'
          : field === 'status' ? 'desc' : 'asc';
        patchState(store, {sortField: field, sortDirection: nextDirection, page: 0});
      },
      getById(id: number): UserRecord | undefined {
        return users().find(u => u.id === id);
      },
      createUser(payload: UserFormPayload): UserRecord {
        const list = users();
        const nextId = list.length ? Math.max(...list.map(u => u.id)) + 1 : 1;
        const user: UserRecord = {
          id: nextId,
          fullName: payload.fullName,
          username: generateUsername(payload.fullName, nextId),
          email: payload.email,
          roles: payload.roles,
          active: payload.active,
          createdAt: new Date().toISOString().slice(0, 10),
          lastAccess: 'Pendiente',
        };
        patchState(store, {users: [user, ...list]});
        return user;
      },
      updateUser(id: number, payload: UserFormPayload): void {
        patchState(store, {
          users: users().map(u => (u.id === id ? {...u, ...payload} : u)),
        });
      },
      toggleUserStatus(id: number, active: boolean): void {
        patchState(store, {
          users: users().map(u => (u.id === id ? {...u, active} : u)),
        });
      },
      setLoading(loading: boolean): void {
        patchState(store, {loading});
      },
    };
  }),
);

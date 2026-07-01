export interface UserRecord {
  id: number;
  fullName: string;
  username: string;
  email: string;
  roles: string[];
  active: boolean;
  createdAt: string;
  lastAccess: string;
}

export interface UserFormPayload {
  fullName: string;
  email: string;
  roles: string[];
  active: boolean;
}

export type UsersSortField = 'fullName' | 'username' | 'email' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface UsersSortOption {
  label: string;
  value: `${UsersSortField}:${SortDirection}`;
}

export const USER_ROLE_OPTIONS = [
  {label: 'Administrador', value: 'ADMIN'},
  {label: 'Jefe', value: 'CHIEF'},
  {label: 'Secretaria', value: 'SECRETARY'},
  {label: 'Mantenimiento', value: 'MAINTENANCE'},
  {label: 'Programador', value: 'PROGRAMMER'},
  {label: 'Redes', value: 'NETWORK'},
  {label: 'Electricidad', value: 'ELECTRICITY'},
];

export const USERS_SORT_OPTIONS: UsersSortOption[] = [
  {label: 'Nombre A-Z', value: 'fullName:asc'},
  {label: 'Nombre Z-A', value: 'fullName:desc'},
  {label: 'Usuario A-Z', value: 'username:asc'},
  {label: 'Usuario Z-A', value: 'username:desc'},
  {label: 'Email A-Z', value: 'email:asc'},
  {label: 'Activos primero', value: 'status:desc'},
  {label: 'Inactivos primero', value: 'status:asc'},
];

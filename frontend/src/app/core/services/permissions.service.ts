import {computed, inject, Injectable} from '@angular/core';
import {AuthService} from './auth.service';

export type AppRole = 'ADMIN' | 'CHIEF' | 'SECRETARY';

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  CHIEF: 'Jefe',
  SECRETARY: 'Secretaria',
};

const PRIVILEGED_ROLES: AppRole[] = ['ADMIN', 'CHIEF', 'SECRETARY'];

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private authService = inject(AuthService);

  roles = computed(() => this.normalizeRoles(this.authService.currentUser()?.roles ?? []));

  isAdmin = computed(() => this.hasRole('ADMIN'));
  isChief = computed(() => this.hasRole('CHIEF'));
  isAdminOrChief = computed(() => this.hasAnyRole(['ADMIN', 'CHIEF']));
  isSecretary = computed(() => this.hasRole('SECRETARY'));
  isStaff = computed(() => !this.hasAnyRole(PRIVILEGED_ROLES));

  canManageUsers = computed(() => this.isAdminOrChief());
  canDeleteBoard = computed(() => this.isAdmin());
  canManageBoardMembers = computed(() => this.isAdminOrChief());
  canManageBoardLists = computed(() => this.isAdmin());
  canCreateBoard = computed(() => this.isAdminOrChief());
  canAssignTasks = computed(() => this.isAdminOrChief() || this.isSecretary());
  canDeleteIssues = computed(() => this.isAdminOrChief() || this.isSecretary());

  hasRole(role: AppRole): boolean {
    return this.roles().includes(role);
  }

  hasAnyRole(roles: AppRole[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  isPrivilegedRole(role: string): boolean {
    const normalized = this.normalizeRole(role);
    return normalized != null && PRIVILEGED_ROLES.includes(normalized);
  }

  roleLabel(role: string): string {
    if (!role || role === 'STAFF') {
      return 'Personal';
    }
    const normalized = this.normalizeRole(role);
    return normalized ? ROLE_LABELS[normalized] : role;
  }

  private normalizeRoles(roles: string[]): AppRole[] {
    return roles.map(r => this.normalizeRole(r)).filter((r): r is AppRole => !!r);
  }

  private normalizeRole(role: string): AppRole | null {
    const upper = role.trim().toUpperCase();
    const fromLabel = (Object.entries(ROLE_LABELS) as [AppRole, string][])
      .find(([, label]) => label.toLowerCase() === role.trim().toLowerCase())?.[0];
    const value = (fromLabel ?? upper) as AppRole;
    if (value in ROLE_LABELS) {
      return value;
    }
    return null;
  }
}

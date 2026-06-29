import {HttpClient} from '@angular/common/http';
import {computed, inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {
  AuthOrganization,
  AuthenticatedUser,
  ChangePasswordPayload,
  LoginPayload,
} from '../models/auth.models';
import {NotificationService} from './notification.service';

const TOKEN_KEY = 'scar-token';
const USER_KEY = 'scar-user';
const ORG_KEY = 'scar-org';

interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
  organization: AuthOrganization;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);

  private tokenState = signal<string | null>(this.readToken());
  private currentUserState = signal<AuthenticatedUser | null>(this.readStoredUser());
  private organizationState = signal<AuthOrganization | null>(this.readStoredOrg());

  currentUser = computed(() => this.currentUserState());
  organization = computed(() => this.organizationState());
  isAuthenticated = computed(() => this.tokenState() !== null && this.currentUserState() !== null);

  constructor() {
    if (environment.useApi && this.tokenState()) {
      void this.validateSession();
    }
  }

  getToken(): string | null {
    return this.tokenState();
  }

  async login(payload: LoginPayload): Promise<void> {
    if (!environment.useApi) {
      this.setSession('mock-token', {
        id: 'mock-1',
        fullName: 'Pedro Condori',
        username: payload.username || 'pcondori',
        email: 'pedro.condori@scar.local',
        roles: ['Administrador'],
        active: true,
      }, {
        id: 'mock-org',
        name: 'SCAR Operaciones',
        slug: payload.organizationSlug ?? 'scar',
      });
      await this.router.navigateByUrl('/work/issues');
      return;
    }

    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, {
        username: payload.username,
        password: payload.password,
        organizationSlug: payload.organizationSlug ?? 'scar',
      })
    );

    this.setSession(response.token, response.user, response.organization);
    this.notificationService.startPolling();
    await this.router.navigateByUrl('/work/issues');
  }

  logout(): void {
    this.clearSession();
    this.notificationService.stopPolling();
    this.router.navigateByUrl('/auth/login');
  }

  updateProfile(payload: Pick<AuthenticatedUser, 'fullName' | 'email'>): void {
    const currentUser = this.currentUserState();
    if (!currentUser) {
      return;
    }

    const next = { ...currentUser, ...payload };
    this.currentUserState.set(next);
    localStorage.setItem(USER_KEY, JSON.stringify(next));
  }

  changePassword(_payload: ChangePasswordPayload): void {
    // Endpoint de cambio de contraseña pendiente en el backend.
  }

  private async validateSession(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<AuthenticatedUser>(`${environment.apiUrl}/api/auth/me`)
      );
      this.currentUserState.set(user);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.notificationService.startPolling();
    } catch {
      this.clearSession();
    }
  }

  private setSession(token: string, user: AuthenticatedUser, org: AuthOrganization): void {
    this.tokenState.set(token);
    this.currentUserState.set(user);
    this.organizationState.set(org);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(ORG_KEY, JSON.stringify(org));
  }

  private clearSession(): void {
    this.tokenState.set(null);
    this.currentUserState.set(null);
    this.organizationState.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORG_KEY);
  }

  private readToken(): string | null {
    if (!environment.useApi) {
      return null;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  private readStoredUser(): AuthenticatedUser | null {
    if (!environment.useApi) {
      return null;
    }
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthenticatedUser) : null;
    } catch {
      return null;
    }
  }

  private readStoredOrg(): AuthOrganization | null {
    if (!environment.useApi) {
      return null;
    }
    try {
      const raw = localStorage.getItem(ORG_KEY);
      return raw ? (JSON.parse(raw) as AuthOrganization) : null;
    } catch {
      return null;
    }
  }
}

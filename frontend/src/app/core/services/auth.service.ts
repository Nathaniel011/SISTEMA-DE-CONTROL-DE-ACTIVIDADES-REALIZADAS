import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {computed, inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';
import {
  AuthenticatedUser,
  ChangePasswordPayload,
  LoginPayload,
} from '../models/auth.models';
import {NotificationService} from './notification.service';

const TOKEN_KEY = 'scar-token';
const USER_KEY = 'scar-user';

interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
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
  private sessionExpired = signal(false);

  currentUser = computed(() => this.currentUserState());
  isAuthenticated = computed(() => this.tokenState() !== null && this.currentUserState() !== null);
  expired = this.sessionExpired.asReadonly();

  constructor() {
    const token = this.tokenState();
    if (environment.useApi && token) {
      // The HTTP interceptors depend on AuthService and need construction to finish first.
      queueMicrotask(() => {
        if (this.tokenState() === token) void this.validateSession(token);
      });
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
        username: payload.username || 'administrador',
        email: 'admin@gmail.com',
        roles: ['Administrador'],
        active: true,
      });
      await this.router.navigateByUrl('/work/issues');
      return;
    }

    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, {
        username: payload.username,
        password: payload.password,
      })
    );

    this.setSession(response.token, response.user);
    this.notificationService.startPolling();
    await this.router.navigateByUrl('/work/issues');
  }

  logout(reason: 'manual' | 'expired' = 'manual'): void {
    this.sessionExpired.set(reason === 'expired');
    this.clearSession();
    this.notificationService.stopPolling();
    void this.router.navigateByUrl('/auth/login', {replaceUrl: true});
  }

  updateProfile(payload: Pick<AuthenticatedUser, 'fullName' | 'email'>): Promise<AuthenticatedUser> {
    const currentUser = this.currentUserState();
    if (!currentUser) {
      return Promise.reject(new Error('No autenticado'));
    }

    if (!environment.useApi) {
      const next = { ...currentUser, ...payload };
      this.currentUserState.set(next);
      this.persistSession();
      return Promise.resolve(next);
    }

    const token = this.tokenState();
    return firstValueFrom(
      this.http.put<AuthenticatedUser>(`${environment.apiUrl}/api/auth/profile`, payload)
    ).then(user => {
      if (this.tokenState() === token) {
        this.currentUserState.set(user);
        this.persistSession();
      }
      return user;
    });
  }

  changePassword(payload: ChangePasswordPayload): Promise<void> {
    if (!environment.useApi) {
      return Promise.resolve();
    }

    return firstValueFrom(
      this.http.put<void>(`${environment.apiUrl}/api/auth/password`, {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
        confirmPassword: payload.confirmPassword,
      })
    );
  }

  private async validateSession(token: string): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<AuthenticatedUser>(`${environment.apiUrl}/api/auth/me`)
      );
      if (this.tokenState() !== token) return;
      this.currentUserState.set(user);
      this.persistSession();
      this.notificationService.startPolling();
    } catch (error: unknown) {
      // Solo limpiar sesión ante token inválido/expirado; no por caídas de red o 5xx.
      if (this.tokenState() === token && error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        this.logout('expired');
      }
    }
  }

  private setSession(token: string, user: AuthenticatedUser): void {
    this.sessionExpired.set(false);
    this.tokenState.set(token);
    this.currentUserState.set(user);
    this.persistSession();
  }

  private clearSession(): void {
    this.tokenState.set(null);
    this.currentUserState.set(null);
    this.persistSession();
  }

  private persistSession(): void {
    try {
      const token = this.tokenState();
      const user = this.currentUserState();
      if (token && user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Authentication remains available in memory when browser storage is blocked.
    }
  }

  private readToken(): string | null {
    if (!environment.useApi) {
      return null;
    }
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
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

}

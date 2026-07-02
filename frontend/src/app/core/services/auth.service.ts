import {HttpClient} from '@angular/common/http';
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

  currentUser = computed(() => this.currentUserState());
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

  private setSession(token: string, user: AuthenticatedUser): void {
    this.tokenState.set(token);
    this.currentUserState.set(user);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private clearSession(): void {
    this.tokenState.set(null);
    this.currentUserState.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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

}

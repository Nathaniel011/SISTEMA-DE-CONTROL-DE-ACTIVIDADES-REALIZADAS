import {HttpClient} from '@angular/common/http';
import {computed, inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../environments/environment';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  issueId: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  private items = signal<AppNotification[]>([]);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  notifications = computed(() => this.items());
  unreadCount = computed(() => this.items().filter(n => !n.read).length);

  async refresh(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    const list = await firstValueFrom(
      this.http.get<AppNotification[]>(`${this.base}/api/notifications`)
    );
    this.items.set(list);
  }

  startPolling(): void {
    if (!environment.useApi || this.pollHandle) {
      return;
    }
    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_MS);
  }

  stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.items.set([]);
  }

  async markRead(id: string): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    await firstValueFrom(this.http.patch<void>(`${this.base}/api/notifications/${id}/read`, {}));
    this.items.update(list => list.map(n => (n.id === id ? { ...n, read: true } : n)));
  }

  async markAllRead(): Promise<void> {
    if (!environment.useApi) {
      return;
    }
    await firstValueFrom(this.http.patch<void>(`${this.base}/api/notifications/read-all`, {}));
    this.items.update(list => list.map(n => ({ ...n, read: true })));
  }
}

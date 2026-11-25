import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {WorkService} from '../../../core/services/work.service';
import {WorkWritingField} from '../work-writing-field/work-writing-field';
import {boardDisplayName} from '../work.utils';

interface PersonalItem {
  id: string;
  kind: 'capture' | 'focus';
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  issueId: string | null;
}

@Component({
  selector: 'app-work-personal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, InputText, Select, WorkWritingField],
  templateUrl: './work-personal.html',
})
export class WorkPersonal {
  private readonly http = inject(HttpClient);
  private readonly work = inject(WorkService);
  private readonly url = `${environment.apiUrl}/api/users/me/personal-work`;
  protected readonly demo = !environment.useApi;
  protected readonly items = signal<PersonalItem[]>([]);
  protected readonly kind = signal<PersonalItem['kind']>('capture');
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly issue = signal<string | null>(null);
  protected readonly promoting = signal<string | null>(null);
  protected readonly project = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly visibleItems = computed(() => this.items().filter(item => item.kind === this.kind())
    .sort((a, b) => this.kind() === 'focus' ? (a.startAt ?? '').localeCompare(b.startAt ?? '') : 0));
  protected readonly boards = computed(() => this.work.standardBoards().map(board => ({label: boardDisplayName(board), value: board.id})));
  protected readonly issues = computed(() => this.work.cards().map(card => ({label: `${this.work.getIssueKey(card)} · ${card.title}`, value: card.id})));
  protected readonly scheduleLabel = (value: string) => new Intl.DateTimeFormat('es-BO', {dateStyle: 'short', timeStyle: 'short'}).format(new Date(value));

  constructor() {
    if (!this.demo) void this.load();
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      this.items.set(await firstValueFrom(this.http.get<PersonalItem[]>(this.url)));
      this.loaded.set(true);
      void this.work.ensureAllCards().catch(() => undefined);
    });
  }

  protected setKind(kind: PersonalItem['kind']): void {
    if (this.busy() || this.kind() === kind) return;
    this.kind.set(kind);
    this.error.set('');
  }

  protected async add(): Promise<void> {
    if (!this.title().trim()) return;
    const focus = this.kind() === 'focus';
    const from = new Date(this.start());
    const to = new Date(this.end());
    if (focus && (!Number.isFinite(from.valueOf()) || !Number.isFinite(to.valueOf()) || to <= from)) {
      this.error.set('Elige una hora de fin posterior al inicio.');
      return;
    }
    await this.run(async () => {
      const created = await firstValueFrom(this.http.post<PersonalItem>(this.url, {
        kind: this.kind(), title: this.title().trim(), description: this.description().trim(),
        ...(focus ? {startAt: from.toISOString(), endAt: to.toISOString(), issueId: this.issue()} : {}),
      }));
      this.items.update(items => [created, ...items]);
      this.title.set('');
      this.description.set('');
    });
  }

  protected async promote(item: PersonalItem): Promise<void> {
    const projectId = this.project();
    if (!projectId) return;
    await this.run(async () => {
      const saved = await firstValueFrom(this.http.post<PersonalItem>(`${this.url}/${item.id}/promote`, {projectId}));
      this.items.update(items => items.map(existing => existing.id === saved.id ? saved : existing));
      this.promoting.set(null);
      this.project.set(null);
    });
  }

  protected async remove(item: PersonalItem): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`${this.url}/${item.id}`));
      this.items.update(items => items.filter(existing => existing.id !== item.id));
      if (this.promoting() === item.id) this.promoting.set(null);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (failure) {
      this.error.set(failure instanceof HttpErrorResponse && failure.status === 409
        ? 'No se pudo guardar. Revisa si el horario ya está reservado o si alcanzaste el límite de elementos.'
        : 'No se pudo completar la operación. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}

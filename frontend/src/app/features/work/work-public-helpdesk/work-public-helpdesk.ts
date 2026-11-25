import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {WorkWritingField} from '../work-writing-field/work-writing-field';

interface Receipt { reference: string; trackingToken: string }
interface Tracking {
  reference: string;
  status: 'registered' | 'in_progress' | 'closed';
  createdAt: string;
  replies: {text: string; createdAt: string}[];
}

const STATUS = {registered: 'Registrada', in_progress: 'En atención', closed: 'Finalizada'};

@Component({
  selector: 'app-work-public-helpdesk',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, InputText, WorkWritingField],
  templateUrl: './work-public-helpdesk.html',
})
export class WorkPublicHelpdesk {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly base = `${environment.apiUrl}/api/public`;
  private submissionKey = '';
  private attemptedDraft = '';

  protected readonly trackingPage = this.route.snapshot.data['tracking'] === true;
  protected readonly enabled = signal<boolean | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly receipt = signal<Receipt | null>(null);
  protected readonly tracking = signal<Tracking | null>(null);
  protected readonly status = computed(() => STATUS[this.tracking()?.status ?? 'registered']);
  protected readonly ready = computed(() => Boolean(this.name().trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())
    && this.title().trim() && this.description().trim()));
  protected readonly date = (value: string) => new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.trackingPage) {
        const token = this.route.snapshot.fragment;
        if (!token || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) {
          this.error.set('Abre el enlace completo que recibiste al registrar la solicitud.');
          return;
        }
        this.tracking.set(await firstValueFrom(this.http.get<Tracking>(`${this.base}/tracking/${token}`)));
      } else {
        const availability = await firstValueFrom(this.http.get<{enabled: boolean}>(`${this.base}/requests/availability`));
        this.enabled.set(availability.enabled);
      }
    } catch (failure) {
      this.error.set(failure instanceof HttpErrorResponse && failure.status === 404
        ? 'El enlace de seguimiento no está disponible.' : 'No se pudo conectar con SCAR. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (!this.ready() || this.loading() || !this.enabled() || this.receipt()) return;
    const draft = {name: this.name().trim(), email: this.email().trim(), title: this.title().trim(), description: this.description().trim()};
    const serialized = JSON.stringify(draft);
    if (this.attemptedDraft !== serialized) {
      this.submissionKey = crypto.randomUUID();
      this.attemptedDraft = serialized;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.receipt.set(await firstValueFrom(this.http.post<Receipt>(`${this.base}/requests`, {
        ...draft, requestId: this.submissionKey,
      })));
    } catch (failure) {
      this.error.set(failure instanceof HttpErrorResponse && failure.status === 429
        ? 'Se alcanzó el límite de envíos. Inténtalo en unos minutos.' : 'No se pudo registrar tu solicitud. Conservamos los datos para que vuelvas a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }
}

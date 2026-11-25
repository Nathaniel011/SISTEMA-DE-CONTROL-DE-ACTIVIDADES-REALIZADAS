import {ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router, RouterLink, UrlTree} from '@angular/router';
import {Button} from 'primeng/button';
import {WorkService} from '../../../core/services/work.service';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkCard} from '../work.models';

@Component({
  selector: 'app-work-issue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, WorkCardDrawer, WorkPageHeader],
  template: `
    <main class="yt-content yt-content-standalone grid gap-4" aria-labelledby="standalone-issue-title">
      <nav aria-label="Ubicación de la incidencia" class="flex flex-wrap items-center gap-2 text-sm">
        <a routerLink="/work/issues" class="font-semibold text-primary-800 hover:underline">Incidencias</a>
        @if (issue(); as card) {
          <span aria-hidden="true">/</span>
          <span aria-current="page">{{ work.getIssueKey(card) }}</span>
        }
      </nav>
      @if (loading()) {
        <app-work-page-header headingId="standalone-issue-title" title="Ficha de incidencia" icon="pi pi-file-edit" />
        <p role="status" class="m-0 text-surface-600">Cargando incidencia…</p>
      } @else if (issue(); as card) {
        <app-work-card-drawer [cardId]="card.id" [fullPage]="true" [visible]="true" [discardDraftOnClose]="false"
          (visibleChange)="!$event && goBack()" />
      } @else {
        <app-work-page-header headingId="standalone-issue-title" title="Ficha de incidencia" icon="pi pi-file-edit" />
        <div class="rounded-xl border border-surface-200 bg-surface-0 p-5">
          <p role="alert" class="mt-0 text-surface-700">No se pudo abrir la incidencia. Comprueba el enlace y tu acceso.</p>
          <div class="flex flex-wrap gap-2">
            <p-button label="Reintentar" ariaLabel="Reintentar" [outlined]="true" (onClick)="load(reference())" />
            <p-button label="Volver a incidencias" ariaLabel="Volver a incidencias" severity="secondary" [text]="true" (onClick)="goBack()" />
          </div>
        </div>
      }
    </main>
  `,
})
export class WorkIssuePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly work = inject(WorkService);
  private readonly drawer = viewChild(WorkCardDrawer);
  private readonly params = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  protected readonly reference = computed(() => this.params().get('reference') ?? '');
  private readonly loaded = signal<WorkCard | undefined>(undefined);
  protected readonly issue = computed(() => {
    const id = this.loaded()?.id;
    return id ? this.work.getCard(id) : undefined;
  });
  protected readonly loading = signal(true);
  private request = 0;

  constructor() {
    effect(() => {
      const reference = this.reference();
      untracked(() => void this.load(reference));
    });
  }

  protected async load(reference: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.loaded.set(undefined);
    try {
      const issue = await this.work.loadIssue(reference);
      if (request === this.request) this.loaded.set(issue);
    } catch {
      // The same recovery state covers missing and unauthorized issues.
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected goBack(): void {
    const raw = this.route.snapshot.queryParamMap.get('returnTo');
    let target: UrlTree | undefined;
    if (raw?.startsWith('/work/') && raw.length <= 3000) {
      try {
        const candidate = this.router.parseUrl(raw);
        const segments = candidate.root.children['primary']?.segments.map(segment => segment.path) ?? [];
        if (segments[0] === 'work' && (
          (segments[1] === 'issues' && segments.length === 2)
          || ['agile', 'inbox', 'planning', 'gantt', 'personal', 'projects'].includes(segments[1])
        )) {
          delete candidate.queryParams['issue'];
          target = candidate;
        }
      } catch {
        // Use the issue list when the return URL is malformed.
      }
    }
    void this.router.navigateByUrl(target ?? '/work/issues', {replaceUrl: true});
  }

  canLeave(): boolean | Promise<boolean> {
    return this.drawer()?.confirmNavigation() ?? true;
  }
}

import {HttpErrorResponse} from '@angular/common/http';
import {afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, signal, untracked, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {Textarea} from 'primeng/textarea';
import {catchError, firstValueFrom, map, of, Subject, switchMap} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../core/services/auth.service';
import {KnowledgeArticle, KnowledgeArticlePayload, WorkApiService} from '../../../core/services/work-api.service';
import {WorkService} from '../../../core/services/work.service';
import {debouncedAction} from '../../../core/timing/debounced-action';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {boardDisplayName, formatWorkDate} from '../work.utils';

const STORAGE_KEY = 'scar-knowledge-v1';
const statuses = [
  {label: 'Borrador', value: 'draft'},
  {label: 'Publicado', value: 'published'},
  {label: 'Archivado', value: 'archived'},
] as const;
type Status = KnowledgeArticle['status'];
type Draft = {title: string; content: string; tags: string; projectId: string | null; status: Status};

function blankDraft(projectId: string | null): Draft {
  return {title: '', content: '', tags: '', projectId, status: 'draft'};
}

export function parseKnowledgeTags(value: string): string[] {
  const tags = new Map<string, string>();
  for (const token of value.split(',')) {
    const tag = token.trim();
    const key = tag.toLocaleLowerCase('es');
    if (tag && !tags.has(key)) tags.set(key, tag);
  }
  return [...tags.values()];
}

function searchKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

@Component({
  selector: 'app-work-knowledge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Dialog, InputText, Select, Tag, Textarea, WorkPageHeader, WorkSkeleton],
  templateUrl: './work-knowledge.html',
  host: {'(window:beforeunload)': 'warnUnsaved($event)'},
})
export class WorkKnowledge {
  private readonly api = inject(WorkApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly work = inject(WorkService);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly params = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});
  private readonly searchDelay = debouncedAction(270);
  private readonly reload = new Subject<{project: string | null; query: string}>();
  private readonly localArticles = signal<KnowledgeArticle[]>([]);
  private readonly original = signal(blankDraft(null));
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly readerHeading = viewChild<ElementRef<HTMLHeadingElement>>('readerHeading');
  private discardDecision?: Promise<boolean>;
  private resolveDiscard?: (allowed: boolean) => void;

  protected readonly demo = !environment.useApi;
  protected readonly statusOptions = [...statuses];
  protected readonly articles = signal<KnowledgeArticle[]>([]);
  protected readonly selected = signal<KnowledgeArticle | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal(blankDraft(null));
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly loadError = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly discardOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly conflict = signal(false);
  protected readonly query = computed(() => this.params().get('q') ?? '');
  protected readonly projectFilter = computed(() => this.params().get('board'));
  protected readonly searchDraft = signal(this.query());
  protected readonly formatDate = formatWorkDate;
  protected readonly tags = computed(() => parseKnowledgeTags(this.draft().tags));
  protected readonly dirty = computed(() => this.editing() && JSON.stringify(this.draft()) !== JSON.stringify(this.original()));
  private readonly projectOptions = computed(() => this.work.boards().map(board => ({label: boardDisplayName(board), value: board.id})));
  protected readonly filterOptions = computed(() => [{label: 'Todos los proyectos', value: null}, ...this.projectOptions()]);
  protected readonly editorOptions = computed(() => [
    {label: this.selected()?.projectRemoved ? 'Proyecto eliminado' : 'General', value: null},
    ...this.projectOptions(),
  ]);

  constructor() {
    if (this.demo) this.localArticles.set(this.readLocalArticles());
    this.reload.pipe(
      switchMap(({project, query}) => {
        const request = this.demo ? of(this.filterLocal(project, query)) : this.api.listKnowledgeArticles(project, query);
        return request.pipe(map(articles => ({articles, failed: false})), catchError(() => of({articles: [], failed: true})));
      }),
      takeUntilDestroyed(this.destroy),
    ).subscribe(({articles, failed}) => {
      this.loading.set(false);
      this.loadError.set(failed);
      this.articles.set(articles);
    });
    effect(() => {
      const query = this.query();
      untracked(() => {
        this.searchDelay.cancel();
        this.searchDraft.set(query);
      });
    });
    effect(() => {
      const project = this.projectFilter();
      const query = this.query();
      untracked(() => this.loadArticles(project, query));
    });
    this.destroy.onDestroy(() => this.resolveDiscard?.(false));
  }

  protected loadArticles(project = this.projectFilter(), query = this.query()): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.reload.next({project, query});
  }

  protected search(value: string): void {
    this.searchDraft.set(value);
    this.searchDelay.schedule(() => this.updateFilters({q: value.trim() || null}));
  }

  protected updateFilters(queryParams: {q?: string | null; board?: string | null}): void {
    void this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true});
  }

  protected async openArticle(article: KnowledgeArticle): Promise<void> {
    if (this.busy() || !await this.confirmDiscard()) return;
    this.showArticle(article);
  }

  protected async newArticle(): Promise<void> {
    if (this.busy() || !await this.confirmDiscard()) return;
    this.selected.set(null);
    this.beginEditing(blankDraft(this.projectFilter()));
  }

  protected editArticle(): void {
    const article = this.selected();
    if (!article?.canEdit || this.busy()) return;
    this.beginEditing({title: article.title, content: article.content, tags: article.tags.join(', '), projectId: article.projectId, status: article.status});
  }

  protected changeDraft(patch: Partial<Draft>): void {
    this.draft.update(value => ({...value, ...patch}));
  }

  protected async cancelEdit(): Promise<void> {
    if (this.busy() || !await this.confirmDiscard()) return;
    this.showArticle(this.selected());
  }

  protected async saveArticle(): Promise<void> {
    if (!this.editing() || this.busy()) return;
    const {title, content, projectId, status} = this.draft();
    const tags = this.tags();
    this.error.set('');
    if (!title.trim()) {
      this.error.set('Escribe un título para guardar el artículo.');
      this.titleInput()?.nativeElement.focus();
      return;
    }
    if (tags.length > 30 || tags.some(tag => tag.length > 64)) {
      this.error.set('Usa hasta 30 etiquetas de 64 caracteres cada una.');
      return;
    }
    const previous = this.selected();
    const payload: KnowledgeArticlePayload = {title: title.trim(), content, tags, projectId, status,
      clearProject: !!previous?.projectId && projectId === null, expectedUpdatedAt: previous?.updatedAt};
    this.busy.set(true);
    try {
      const saved = this.demo ? this.saveLocal(payload, previous) : await firstValueFrom(previous
        ? this.api.updateKnowledgeArticle(previous.id, payload) : this.api.createKnowledgeArticle(payload));
      this.showArticle(saved);
      this.notice.set('Artículo guardado.');
      this.loadArticles();
    } catch (error) {
      const stale = error instanceof HttpErrorResponse && error.status === 409;
      this.conflict.set(stale);
      this.error.set(stale ? 'El artículo cambió en otra sesión. Tu borrador sigue aquí.' : this.message(error, 'No se pudo guardar el artículo. Tu borrador sigue aquí.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async reloadSelected(): Promise<void> {
    const article = this.selected();
    if (!article || this.busy() || !await this.confirmDiscard()) return;
    this.busy.set(true);
    try {
      this.showArticle(await firstValueFrom(this.api.getKnowledgeArticle(article.id)));
      this.loadArticles();
    } catch (error) {
      this.error.set(this.message(error, 'No se pudo abrir la versión actual.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteArticle(): Promise<void> {
    const article = this.selected();
    if (!article?.canEdit || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.demo) this.writeLocalArticles(this.localArticles().filter(item => item.id !== article.id));
      else await firstValueFrom(this.api.deleteKnowledgeArticle(article.id));
      this.deleteOpen.set(false);
      this.showArticle(null);
      this.notice.set('Artículo eliminado.');
      this.loadArticles();
    } catch (error) {
      this.deleteOpen.set(false);
      this.error.set(this.message(error, 'No se pudo eliminar el artículo.'));
    } finally {
      this.busy.set(false);
    }
  }

  canLeave(): boolean | Promise<boolean> {
    return !this.busy() && this.confirmDiscard();
  }

  protected warnUnsaved(event: BeforeUnloadEvent): void {
    if (!this.auth.isAuthenticated() || (!this.dirty() && !this.busy())) return;
    event.preventDefault();
    event.returnValue = '';
  }

  protected answerDiscard(allowed: boolean): void {
    this.discardOpen.set(false);
    this.resolveDiscard?.(allowed);
  }

  private confirmDiscard(): boolean | Promise<boolean> {
    if (!this.dirty()) return true;
    if (!this.discardDecision) {
      this.discardOpen.set(true);
      this.discardDecision = new Promise<boolean>(resolve => this.resolveDiscard = resolve).finally(() => {
        this.discardDecision = undefined;
        this.resolveDiscard = undefined;
      });
    }
    return this.discardDecision;
  }

  private clearMessages(): void {
    this.conflict.set(false);
    this.error.set('');
    this.notice.set('');
  }

  private showArticle(article: KnowledgeArticle | null): void {
    this.clearMessages();
    this.selected.set(article);
    this.editing.set(false);
    afterNextRender(() => this.readerHeading()?.nativeElement.focus(), {injector: this.injector});
  }

  private beginEditing(draft: Draft): void {
    this.clearMessages();
    this.original.set(draft);
    this.draft.set(draft);
    this.editing.set(true);
    afterNextRender(() => this.titleInput()?.nativeElement.focus(), {injector: this.injector});
  }

  protected statusLabel(status: Status): string {
    return statuses.find(item => item.value === status)?.label ?? status;
  }

  protected scopeLabel(article: KnowledgeArticle): string {
    return article.projectRemoved ? 'Proyecto eliminado' : article.projectName ?? 'General';
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : fallback;
  }

  private filterLocal(project: string | null, query: string): KnowledgeArticle[] {
    const text = searchKey(query);
    return this.localArticles().filter(article => (!project || article.projectId === project)
      && searchKey([article.title, article.content, ...article.tags].join(' ')).includes(text));
  }

  private readLocalArticles(): KnowledgeArticle[] {
    try {
      const articles = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as KnowledgeArticle[];
      if (!Array.isArray(articles)) return [];
      return articles.filter(article => typeof article?.title === 'string' && typeof article.id === 'string')
        .map(article => ({...article, content: article.content ?? '', tags: Array.isArray(article.tags) ? article.tags : [], canEdit: true, projectRemoved: false}));
    } catch {
      return [];
    }
  }

  private saveLocal(payload: KnowledgeArticlePayload, previous: KnowledgeArticle | null): KnowledgeArticle {
    const now = new Date().toISOString();
    const id = previous?.id ?? crypto.randomUUID();
    const article: KnowledgeArticle = {id, projectId: payload.projectId ?? null, canEdit: true, projectRemoved: false,
      projectName: this.work.getBoard(payload.projectId ?? '')?.name ?? null,
      title: payload.title ?? '', slug: previous?.slug ?? `articulo-${id.slice(0, 8)}`, content: payload.content ?? '',
      tags: payload.tags ?? [], status: payload.status ?? 'draft', authorName: previous?.authorName ?? 'Local',
      updatedByName: 'Local', createdAt: previous?.createdAt ?? now, updatedAt: now};
    this.writeLocalArticles([article, ...this.localArticles().filter(item => item.id !== id)]);
    return article;
  }

  private writeLocalArticles(articles: KnowledgeArticle[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    this.localArticles.set(articles);
  }
}

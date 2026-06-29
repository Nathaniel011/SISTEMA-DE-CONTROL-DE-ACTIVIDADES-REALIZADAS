import {Component, OnInit, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {ProgressSpinner} from 'primeng/progressspinner';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {Textarea} from 'primeng/textarea';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {
  KnowledgeArticle,
  KnowledgeArticlePayload,
  WorkApiService,
} from '../../../core/services/work-api.service';
import {WorkService} from '../../../core/services/work.service';

const STORAGE_KEY = 'scar-knowledge-v1';

@Component({
  selector: 'app-work-knowledge',
  imports: [FormsModule, Button, InputText, ProgressSpinner, Select, Tag, Textarea],
  templateUrl: './work-knowledge.html',
})
export class WorkKnowledge implements OnInit {
  private workApi = inject(WorkApiService);
  workService = inject(WorkService);

  articles = signal<KnowledgeArticle[]>([]);
  selectedArticleId = signal<string | null>(null);
  editingNew = signal(false);
  loading = signal(false);
  saving = signal(false);
  query = signal('');
  selectedProjectId = signal<string | null>(null);

  editorTitle = signal('');
  editorContent = signal('');
  editorTags = signal('');
  editorProjectId = signal<string | null>(null);
  editorStatus = signal<'draft' | 'published' | 'archived'>('draft');

  projectFilterOptions = computed(() => [
    { label: 'Todos los proyectos', value: null },
    ...this.workService.boards().map(board => ({ label: board.name, value: board.id })),
  ]);

  projectEditorOptions = computed(() => [
    { label: 'General', value: null },
    ...this.workService.boards().map(board => ({ label: board.name, value: board.id })),
  ]);

  statusOptions = [
    { label: 'Borrador', value: 'draft' },
    { label: 'Publicado', value: 'published' },
    { label: 'Archivado', value: 'archived' },
  ];

  visibleArticles = computed(() => {
    const q = this.query().trim().toLowerCase();
    const projectId = this.selectedProjectId();
    return this.articles().filter(article => {
      const matchesProject = !projectId || article.projectId === projectId;
      const matchesQuery = !q
        || article.title.toLowerCase().includes(q)
        || article.content.toLowerCase().includes(q)
        || article.tags.some(tag => tag.toLowerCase().includes(q));
      return matchesProject && matchesQuery;
    });
  });

  selectedArticle = computed(() =>
    this.articles().find(article => article.id === this.selectedArticleId()) ?? null
  );

  ngOnInit(): void {
    void this.loadArticles();
  }

  async loadArticles(): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useApi) {
        const articles = await firstValueFrom(
          this.workApi.listKnowledgeArticles(this.selectedProjectId(), this.query())
        );
        this.articles.set(articles);
      } else {
        this.articles.set(this.loadLocalArticles());
      }
      const selected = this.selectedArticleId();
      const next = selected && this.articles().some(article => article.id === selected)
        ? this.articles().find(article => article.id === selected)!
        : this.visibleArticles()[0] ?? null;
      if (next) {
        this.selectArticle(next);
      } else {
        this.newArticle();
      }
    } finally {
      this.loading.set(false);
    }
  }

  selectArticle(article: KnowledgeArticle): void {
    this.editingNew.set(false);
    this.selectedArticleId.set(article.id);
    this.editorTitle.set(article.title);
    this.editorContent.set(article.content);
    this.editorTags.set(article.tags.join(', '));
    this.editorProjectId.set(article.projectId);
    this.editorStatus.set(article.status);
  }

  newArticle(): void {
    this.editingNew.set(true);
    this.selectedArticleId.set(null);
    this.editorTitle.set('Nuevo articulo');
    this.editorContent.set('');
    this.editorTags.set('');
    this.editorProjectId.set(this.selectedProjectId());
    this.editorStatus.set('draft');
  }

  async saveArticle(): Promise<void> {
    const title = this.editorTitle().trim();
    if (!title) {
      return;
    }
    this.saving.set(true);
    try {
      const payload: KnowledgeArticlePayload = {
        projectId: this.editorProjectId(),
        title,
        content: this.editorContent(),
        tags: this.parseTags(this.editorTags()),
        status: this.editorStatus(),
      };

      if (environment.useApi) {
        const saved = this.selectedArticleId()
          ? await firstValueFrom(this.workApi.updateKnowledgeArticle(this.selectedArticleId()!, payload))
          : await firstValueFrom(this.workApi.createKnowledgeArticle(payload));
        this.upsertArticle(saved);
        this.selectArticle(saved);
      } else {
        const saved = this.saveLocalArticle(payload);
        this.upsertArticle(saved);
        this.persistLocalArticles();
        this.selectArticle(saved);
      }
    } finally {
      this.saving.set(false);
    }
  }

  async deleteArticle(): Promise<void> {
    const id = this.selectedArticleId();
    if (!id) {
      return;
    }
    if (environment.useApi) {
      await firstValueFrom(this.workApi.deleteKnowledgeArticle(id));
    }
    this.articles.set(this.articles().filter(article => article.id !== id));
    if (!environment.useApi) {
      this.persistLocalArticles();
    }
    const next = this.visibleArticles()[0];
    if (next) {
      this.selectArticle(next);
    } else {
      this.newArticle();
    }
  }

  async applyFilters(): Promise<void> {
    if (environment.useApi) {
      await this.loadArticles();
    }
  }

  statusLabel(status: string): string {
    return this.statusOptions.find(option => option.value === status)?.label ?? status;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  parseTags(value: string): string[] {
    return value.split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  private upsertArticle(article: KnowledgeArticle): void {
    this.articles.update(articles =>
      articles.some(item => item.id === article.id)
        ? articles.map(item => item.id === article.id ? article : item)
        : [article, ...articles]
    );
  }

  private saveLocalArticle(payload: KnowledgeArticlePayload): KnowledgeArticle {
    const existing = this.selectedArticle();
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? crypto.randomUUID(),
      projectId: payload.projectId ?? null,
      projectName: this.workService.getBoard(payload.projectId ?? '')?.name ?? null,
      title: payload.title ?? existing?.title ?? 'Articulo',
      slug: existing?.slug ?? `articulo-${crypto.randomUUID().slice(0, 8)}`,
      content: payload.content ?? '',
      tags: payload.tags ?? [],
      status: payload.status ?? 'draft',
      authorName: existing?.authorName ?? 'Local',
      updatedByName: 'Local',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private loadLocalArticles(): KnowledgeArticle[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as KnowledgeArticle[];
      }
    } catch {
      /* default */
    }
    const seed: KnowledgeArticle[] = [{
      id: crypto.randomUUID(),
      projectId: null,
      projectName: null,
      title: 'Guia operativa',
      slug: 'guia-operativa',
      content: 'Documenta decisiones, procedimientos y soluciones reutilizables del equipo.',
      tags: ['operacion'],
      status: 'published',
      authorName: 'Local',
      updatedByName: 'Local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  private persistLocalArticles(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.articles()));
  }
}

import {ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {
  ProjectConfiguration, ProjectConfigurationApi, ProjectField, ProjectFieldKind, ProjectTransition,
} from '../../../core/services/project-configuration-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {PROJECT_FIELD_KINDS} from '../work-project-fields/work-project-fields';
import {WORK_COLUMNS, WORK_STATUS_LABELS, WorkColumnId} from '../work.models';
import {boardDisplayName, WORK_DRAFT_CARD_TITLE} from '../work.utils';

const PROJECT_PANES = [
  {id: 'overview', label: 'Resumen', settings: false},
  {id: 'team', label: 'Equipo', settings: false},
  {id: 'fields', label: 'Campos', settings: true},
  {id: 'workflow', label: 'Flujo de trabajo', settings: true},
] as const;

@Component({
  selector: 'app-work-project-space',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Button, InputText, Textarea, WorkPageHeader],
  templateUrl: './work-project-space.html',
})
export class WorkProjectSpace {
  private readonly api = inject(ProjectConfigurationApi);
  private readonly route = inject(ActivatedRoute);
  protected readonly work = inject(WorkService);
  private readonly params = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  private readonly query = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});
  protected readonly projectId = computed(() => this.params().get('projectId') ?? '');
  protected readonly configuration = signal<ProjectConfiguration | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal('');
  protected readonly actionError = signal('');
  protected readonly fieldName = signal('');
  protected readonly fieldKind = signal<ProjectFieldKind>('text');
  protected readonly optionsText = signal('');
  protected readonly restricted = signal(false);
  protected readonly rules = signal<ProjectTransition[]>([]);
  protected readonly source = signal<WorkColumnId>('todo');
  protected readonly status = WORK_STATUS_LABELS;
  protected readonly states = WORK_COLUMNS.map(column => column.id);
  protected readonly kinds = Object.entries(PROJECT_FIELD_KINDS) as [ProjectFieldKind, string][];
  protected readonly displayName = boardDisplayName;
  protected readonly demo = !environment.useApi;
  private request = 0;

  protected readonly project = computed(() => this.configuration() ? this.work.getBoard(this.projectId()) : undefined);
  protected readonly panes = computed(() => PROJECT_PANES.filter(pane => !pane.settings || this.configuration()?.canManage));
  protected readonly pane = computed(() => this.panes().find(pane => pane.id === this.query().get('section'))?.id ?? 'overview');
  protected readonly members = computed(() => {
    const ids = new Set(this.project()?.memberIds ?? []);
    return this.work.members().filter(member => ids.has(member.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
  private readonly issues = computed(() => this.work.cards()
    .filter(card => card.boardId === this.projectId() && card.title !== WORK_DRAFT_CARD_TITLE));
  protected readonly recent = computed(() => this.issues().slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8));
  protected readonly stats = computed(() => {
    const issues = this.issues();
    const closed = issues.filter(issue => issue.columnId === 'done' || issue.columnId === 'closed').length;
    return {total: issues.length, open: issues.length - closed, closed};
  });
  protected readonly workflowDirty = computed(() => {
    const current = this.configuration()?.transitions;
    if (!this.restricted()) return current != null;
    if (!current || this.rules().length !== current.length) return true;
    return this.rules().some(rule => !current.some(saved => saved.from === rule.from && saved.to === rule.to));
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.load(id));
    });
  }

  protected async load(id: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.loadError.set(false);
    this.configuration.set(null);
    this.saving.set(false);
    this.message.set('');
    this.actionError.set('');
    this.fieldName.set('');
    this.fieldKind.set('text');
    this.optionsText.set('');
    try {
      const [configuration] = await Promise.all([
        this.demo ? Promise.resolve({fields: [], transitions: null, canManage: false}) : firstValueFrom(this.api.get(id)),
        this.work.loadProjectIndex(),
      ]);
      if (request !== this.request) return;
      if (!this.work.getBoard(id)) throw new Error('Proyecto no disponible');
      await this.work.ensureBoardCards(id);
      if (request !== this.request) return;
      this.configuration.set(configuration);
      this.restricted.set(configuration.transitions !== null);
      this.rules.set(configuration.transitions ?? this.defaultRules());
      this.work.updateProjectWorkflow(id, configuration.transitions);
    } catch {
      if (request === this.request) this.loadError.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected async createField(): Promise<void> {
    const name = this.fieldName().trim();
    if (!name || this.saving()) return;
    const kind = this.fieldKind();
    const options = kind === 'enumeration' ? this.optionsText().split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
    const id = this.projectId();
    await this.save(async () => {
      const field = await firstValueFrom(this.api.addField(id, {name, kind, options}));
      if (this.projectId() !== id) return;
      this.configuration.update(config => config && {...config, fields: [...config.fields, field].sort((a, b) => a.name.localeCompare(b.name, 'es'))});
      this.fieldName.set('');
      this.optionsText.set('');
      this.message.set('Campo creado. Ya está disponible en las incidencias del proyecto.');
    }, 'No se pudo crear el campo. Revisa el nombre y las opciones.');
  }

  protected async archiveField(field: ProjectField): Promise<void> {
    const id = this.projectId();
    await this.save(async () => {
      await firstValueFrom(this.api.archiveField(id, field.id, !field.archived));
      if (this.projectId() !== id) return;
      this.configuration.update(config => config && ({
        ...config, fields: config.fields.map(candidate => candidate.id === field.id ? {...candidate, archived: !field.archived} : candidate),
      }));
      this.message.set(field.archived ? 'Campo restaurado.' : 'Campo archivado. Sus valores se conservan.');
    }, 'No se pudo cambiar la disponibilidad del campo.');
  }

  protected permitted(to: WorkColumnId): boolean {
    return this.rules().some(rule => rule.from === this.source() && rule.to === to);
  }

  protected toggleRule(to: WorkColumnId, allowed: boolean): void {
    const from = this.source();
    this.rules.update(rules => allowed ? [...rules, {from, to}]
      : rules.filter(rule => rule.from !== from || rule.to !== to));
  }

  protected async publishWorkflow(): Promise<void> {
    const id = this.projectId();
    const transitions = this.restricted() ? this.rules() : null;
    await this.save(async () => {
      await firstValueFrom(this.api.saveWorkflow(id, transitions));
      this.work.updateProjectWorkflow(id, transitions);
      if (this.projectId() !== id) return;
      this.configuration.update(config => config && {...config, transitions});
      this.message.set('Flujo de trabajo publicado.');
    }, 'No se pudo publicar el flujo. Los cambios siguen en el formulario.');
  }

  private defaultRules(): ProjectTransition[] {
    return this.states.flatMap(from => this.states.filter(to => to !== from).map(to => ({from, to})));
  }

  private async save(operation: () => Promise<void>, failure: string): Promise<void> {
    if (this.saving() || !this.configuration()?.canManage) return;
    const request = this.request;
    this.saving.set(true);
    this.actionError.set('');
    this.message.set('');
    try {
      await operation();
    } catch (error) {
      if (request === this.request) this.actionError.set(error instanceof HttpErrorResponse && error.status === 409
        ? 'El proyecto ya tiene un campo con ese nombre o alcanzó su límite.' : failure);
    } finally {
      if (request === this.request) this.saving.set(false);
    }
  }
}

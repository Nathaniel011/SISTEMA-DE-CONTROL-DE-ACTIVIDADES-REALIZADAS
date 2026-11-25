
import {ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {Select} from 'primeng/select';
import {WorkService} from '../../../core/services/work.service';
import {boardDisplayName} from '../work.utils';
import {WorkCard} from '../work.models';
import {WorkWritingField} from '../work-writing-field/work-writing-field';
import {WorkProjectFields} from '../work-project-fields/work-project-fields';
import {IssueFieldValues, ProjectConfigurationApi, ProjectField} from '../../../core/services/project-configuration-api.service';
import {environment} from '../../../../environments/environment';
import {firstValueFrom} from 'rxjs';

@Component({
  selector: 'app-work-issue-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Dialog, Select, WorkWritingField, WorkProjectFields],
  templateUrl: './work-issue-create.html',
})
export class WorkIssueCreate {
  private work = inject(WorkService);
  private readonly config = inject(ProjectConfigurationApi);
  readonly created = output<WorkCard>();
  readonly projectIds = input<readonly string[] | null>(null);
  protected readonly visible = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly boardId = signal<string | null>(null);
  protected readonly lockedBoard = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly fields = signal<ProjectField[]>([]);
  protected readonly fieldValues = signal<IssueFieldValues>({});
  protected readonly fieldsLoading = signal(false);
  protected readonly fieldsError = signal(false);
  private fieldsRequest = 0;
  private readonly listId = signal<string | undefined>(undefined);
  protected readonly boards = computed(() =>
    this.work.boards().filter(board => !this.projectIds() || this.projectIds()!.includes(board.id))
      .map(board => ({label: boardDisplayName(board), value: board.id})),
  );

  constructor() {
    effect(() => {
      const id = this.visible() ? this.boardId() : null;
      untracked(() => void this.loadFields(id));
    });
  }

  open(boardId?: string | null, listId?: string, locked = false): void {
    this.error.set('');
    this.boardId.set(this.boards().find(board => board.value === boardId)?.value
      ?? (this.boards().length === 1 ? this.boards()[0].value : null));
    this.listId.set(listId);
    this.lockedBoard.set(locked);
    this.visible.set(true);
  }

  protected async loadFields(id: string | null): Promise<void> {
    const request = ++this.fieldsRequest;
    this.fields.set([]);
    this.fieldValues.set({});
    this.fieldsLoading.set(false);
    this.fieldsError.set(false);
    if (!id || !environment.useApi) return;
    this.fieldsLoading.set(true);
    try {
      const config = await firstValueFrom(this.config.get(id));
      if (request === this.fieldsRequest) this.fields.set(config.fields.filter(field => !field.archived));
    } catch {
      if (request === this.fieldsRequest) this.fieldsError.set(true);
    } finally {
      if (request === this.fieldsRequest) this.fieldsLoading.set(false);
    }
  }

  protected setField(id: string, value: string | null): void {
    this.fieldValues.update(values => ({...values, [id]: value}));
  }

  protected async create(): Promise<void> {
    const boardId = this.boardId();
    const title = this.title().trim();
    if (!boardId || !title || this.saving() || this.fieldsLoading() || this.fieldsError()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const issue = await this.work.createIssue(boardId, title, 'todo', this.listId(), undefined, {
        description: this.description().trim(),
        customFields: this.fieldValues(),
      });
      this.title.set('');
      this.description.set('');
      this.visible.set(false);
      this.created.emit(issue);
    } catch {
      this.error.set('No se pudo crear la incidencia. Puedes volver a intentar con el mismo asunto.');
    } finally {
      this.saving.set(false);
    }
  }
}

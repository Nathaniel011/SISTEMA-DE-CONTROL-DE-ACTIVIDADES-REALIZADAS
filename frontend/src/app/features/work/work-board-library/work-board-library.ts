import {HttpErrorResponse} from '@angular/common/http';
import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router, RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {MultiSelect} from 'primeng/multiselect';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AgileBoard, AgileBoardApi} from '../../../core/services/agile-board-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkApiService} from '../../../core/services/work-api.service';
import {WorkPageHeader} from '../work-page-header/work-page-header';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {boardDisplayName} from '../work.utils';

@Component({
  selector: 'app-work-board-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Button, Dialog, InputText, MultiSelect, WorkPageHeader, WorkSkeleton],
  templateUrl: './work-board-library.html',
})
export class WorkBoardLibrary {
  private readonly api = inject(AgileBoardApi);
  private readonly workApi = inject(WorkApiService);
  private readonly router = inject(Router);
  protected readonly work = inject(WorkService);
  protected readonly demo = !environment.useApi;
  protected readonly boards = signal<AgileBoard[]>([]);
  private readonly counts = signal<Record<string, {total: number; inProgress: number}>>({});
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly query = signal('');
  protected readonly editing = signal<AgileBoard | null>(null);
  protected readonly deleting = signal<AgileBoard | null>(null);
  protected readonly showEditor = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');
  protected readonly name = signal('');
  protected readonly projectIds = signal<string[]>([]);
  protected readonly projects = computed(() => this.work.standardBoards().slice().sort((a, b) => a.name.localeCompare(b.name, 'es')));
  protected readonly projectOptions = computed(() => this.projects().map(project => ({label: boardDisplayName(project), value: project.id})));
  protected readonly matchingBoards = computed(() => this.boards().filter(board => this.matches(board.name)));
  protected readonly matchingProjects = computed(() => this.projects().filter(project => this.matches(`${project.key} ${project.name}`)));
  protected readonly displayName = boardDisplayName;

  constructor() { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [boards, counts] = await Promise.all([
        this.demo ? Promise.resolve([]) : firstValueFrom(this.api.list()),
        this.demo ? Promise.resolve({}) : firstValueFrom(this.workApi.boardCounts()),
        this.work.loadProjectIndex(),
      ]);
      this.boards.set(boards);
      this.counts.set(counts);
    } catch {
      this.loadError.set('No se pudieron cargar los tableros.');
    } finally {
      this.loading.set(false);
    }
  }

  protected stats(id: string) {
    return this.demo ? this.work.getBoardStats(id) : this.counts()[id] ?? {total: 0, inProgress: 0};
  }

  protected openEditor(board?: AgileBoard): void {
    this.editing.set(board ?? null);
    this.name.set(board?.name ?? '');
    this.projectIds.set(board?.projectIds.filter(id => this.projects().some(project => project.id === id)) ?? []);
    this.actionError.set('');
    this.showEditor.set(true);
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name || !this.projectIds().length || this.busy()) return;
    const id = this.editing()?.id;
    this.busy.set(true);
    this.actionError.set('');
    try {
      const saved = await firstValueFrom(this.api.save({name, projectIds: this.projectIds()}, id));
      this.boards.update(boards => [...boards.filter(board => board.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      this.showEditor.set(false);
      if (!id) await this.router.navigate(['/work/agile/configurado', saved.id]);
    } catch (error) {
      this.actionError.set(error instanceof HttpErrorResponse && error.status === 409
        ? 'El nombre ya está en uso o alcanzaste el límite de tableros.' : 'No se pudo guardar el tablero. Revisa los proyectos seleccionados.');
    } finally {
      this.busy.set(false);
    }
  }

  protected requestDelete(board: AgileBoard): void {
    this.actionError.set('');
    this.deleting.set(board);
  }

  protected async remove(): Promise<void> {
    const board = this.deleting();
    if (!board || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.delete(board.id));
      this.boards.update(items => items.filter(item => item.id !== board.id));
      this.deleting.set(null);
    } catch {
      this.actionError.set('No se pudo eliminar el tablero.');
    } finally {
      this.busy.set(false);
    }
  }

  protected projectNames(board: AgileBoard): string {
    return this.projects().filter(project => board.projectIds.includes(project.id)).map(project => project.name).join(' · ');
  }

  private matches(text: string): boolean {
    return text.toLocaleLowerCase('es').includes(this.query().trim().toLocaleLowerCase('es'));
  }
}

import {DOCUMENT} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, inject, model, signal} from '@angular/core';
import {Router, RouterLink, UrlTree} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Dialog} from 'primeng/dialog';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AgileBoard, AgileBoardApi} from '../../../core/services/agile-board-api.service';
import {WorkService} from '../../../core/services/work.service';
import {WorkBoard} from '../work.models';
import {boardDisplayName} from '../work.utils';

type BoardTab = 'all' | 'personal' | 'favorites' | 'recent';

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

@Component({
  selector: 'app-work-board-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Dialog, IconField, InputIcon, InputText, Button, RouterLink],
  templateUrl: './work-board-switcher.html',
})
export class WorkBoardSwitcher {
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private readonly api = inject(AgileBoardApi);
  private opener: HTMLElement | null = null;
  private previousBoard: UrlTree | null = null;
  workService = inject(WorkService);

  boardDisplayName = boardDisplayName;

  visible = model(false);
  search = signal('');
  activeTab = signal<BoardTab>('all');
  currentBoardId = signal<string | null>(null);
  currentPersonalId = signal<string | null>(null);
  opening = signal(false);
  error = signal('');
  personalBoards = signal<AgileBoard[]>([]);
  personalLoading = signal(false);
  personalError = signal(false);
  filteredPersonal = computed(() => this.personalBoards().filter(board => normalizeSearch(board.name).includes(normalizeSearch(this.search()))));
  favorites = computed(() => this.workService.getFavoriteBoardIds());

  readonly tabs: {id: BoardTab; label: string}[] = [
    {id: 'all', label: 'Por proyecto'},
    {id: 'personal', label: 'Mis tableros'},
    {id: 'favorites', label: 'Favoritos'},
    {id: 'recent', label: 'Recientes'},
  ];

  filteredBoards = computed(() => {
    const query = normalizeSearch(this.search());
    const boards = this.workService.boards();
    const favorites = this.favorites();
    const recent = this.workService.getRecentBoardIds();
    const general = this.workService.generalBoard();
    const prioritized = this.activeTab() === 'favorites' ? favorites
      : this.activeTab() === 'recent' ? recent
      : [...favorites, ...(general ? [general.id] : []), ...recent, ...boards.map(board => board.id)];
    const byId = new Map(boards.map(board => [board.id, board]));
    return [...new Set(prioritized)].flatMap(id => {
      const board = byId.get(id);
      if (!board) return [];
      const haystack = normalizeSearch(`${boardDisplayName(board)} ${board.name} ${board.key} ${board.description ?? ''}`);
      return haystack.includes(query) ? [board] : [];
    });
  });

  open(board: UrlTree): void {
    this.opener = this.document.activeElement as HTMLElement | null;
    this.previousBoard = board;
    const segments = board.root.children['primary']?.segments;
    const boardId = segments?.[2]?.path;
    const personal = boardId === 'configurado';
    this.currentBoardId.set(personal ? null : boardId ?? null);
    this.currentPersonalId.set(personal ? segments?.[3]?.path ?? null : null);
    this.search.set('');
    this.activeTab.set(personal ? 'personal' : 'all');
    this.error.set('');
    this.visible.set(true);
    void this.loadPersonalBoards();
  }

  async loadPersonalBoards(): Promise<void> {
    if (!environment.useApi || this.personalLoading()) return;
    this.personalBoards.set([]);
    this.personalError.set(false);
    this.personalLoading.set(true);
    try {
      this.personalBoards.set(await firstValueFrom(this.api.list()));
    } catch {
      this.personalError.set(true);
    } finally {
      this.personalLoading.set(false);
    }
  }

  restoreFocus(): void {
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  openFirstMatch(event: Event): void {
    if ((event as KeyboardEvent).isComposing || !normalizeSearch(this.search())) return;
    event.preventDefault();
    if (this.activeTab() === 'personal') {
      const personal = this.filteredPersonal()[0];
      if (personal) void this.openPersonal(personal);
      return;
    }
    const board = this.filteredBoards()[0];
    if (board) void this.openBoard(board);
  }

  async openBoard(board: WorkBoard): Promise<void> {
    if (await this.navigateTo(['/work/agile', board.id], this.isCurrent(board))) {
      this.workService.recordBoardVisit(board.id);
    }
  }

  async openPersonal(board: AgileBoard): Promise<void> {
    await this.navigateTo(['/work/agile/configurado', board.id], this.currentPersonalId() === board.id);
  }

  openGlobal(): void {
    void this.navigateTo(['/work/agile/vista'], this.currentBoardId() === 'vista');
  }

  private async navigateTo(route: string[], remembered: boolean): Promise<boolean> {
    if (this.opening()) return false;
    this.error.set('');
    this.opening.set(true);
    try {
      const link = remembered && this.previousBoard ? this.previousBoard : this.router.createUrlTree(route);
      const current = this.router.isActive(link, {paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored'});
      if (current || await this.router.navigateByUrl(link)) {
        this.visible.set(false);
        return true;
      }
      this.error.set('No se pudo abrir el tablero.');
    } catch {
      this.error.set('No se pudo abrir el tablero.');
    } finally {
      this.opening.set(false);
    }
    return false;
  }

  toggleFavorite(board: WorkBoard): void {
    this.error.set(this.workService.toggleFavoriteBoard(board.id) ? '' : 'No se pudo guardar el favorito.');
  }

  isCurrent(board: WorkBoard): boolean {
    return this.currentBoardId() === board.id;
  }
}

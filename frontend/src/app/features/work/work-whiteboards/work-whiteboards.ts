import {Component, HostListener, OnDestroy, OnInit, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {ProgressSpinner} from 'primeng/progressspinner';
import {Select} from 'primeng/select';
import {Textarea} from 'primeng/textarea';
import {firstValueFrom} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../core/services/auth.service';
import {
  WhiteboardDto,
  WhiteboardPayload,
  WorkApiService,
} from '../../../core/services/work-api.service';
import {WorkService} from '../../../core/services/work.service';

type WhiteboardElementType = 'note' | 'text' | 'block';
type PointerMode = 'move' | 'resize';

interface WhiteboardElement {
  id: string;
  type: WhiteboardElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

interface WhiteboardContent {
  elements: WhiteboardElement[];
}

interface PointerState {
  id: string;
  mode: PointerMode;
  startX: number;
  startY: number;
  originalX: number;
  originalY: number;
  originalWidth: number;
  originalHeight: number;
}

const STORAGE_KEY = 'scar-whiteboards-v1';
const EMPTY_CONTENT: WhiteboardContent = { elements: [] };

@Component({
  selector: 'app-work-whiteboards',
  imports: [FormsModule, Button, InputText, ProgressSpinner, Select, Textarea],
  templateUrl: './work-whiteboards.html',
})
export class WorkWhiteboards implements OnInit, OnDestroy {
  private workApi = inject(WorkApiService);
  private authService = inject(AuthService);
  workService = inject(WorkService);

  boards = signal<WhiteboardDto[]>([]);
  selectedWhiteboardId = signal<string | null>(null);
  selectedBoardId = signal<string | null>(null);
  selectedElementId = signal<string | null>(null);
  content = signal<WhiteboardContent>(EMPTY_CONTENT);
  loading = signal(false);
  saving = signal(false);
  saveError = signal(false);
  private dirty = false;
  private saveInFlight?: Promise<boolean>;
  lastSyncedAt = signal<string | null>(null);
  boardName = signal('');
  boardDescription = signal('');

  private eventAbort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerState: PointerState | null = null;

  colors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffffff'];

  boardOptions = computed(() => [
    { label: 'Todos los tableros', value: null },
    ...this.workService.boards().map(board => ({ label: board.name, value: board.id })),
  ]);

  selectedBoard = computed(() =>
    this.boards().find(board => board.id === this.selectedWhiteboardId()) ?? null
  );

  elements = computed(() => this.content().elements);

  selectedElement = computed(() =>
    this.elements().find(element => element.id === this.selectedElementId()) ?? null
  );

  ngOnInit(): void {
    void this.loadWhiteboards();
  }

  ngOnDestroy(): void {
    this.closeEvents();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
  }

  async loadWhiteboards(): Promise<void> {
    this.loading.set(true);
    try {
      if (environment.useApi) {
        const boards = await firstValueFrom(this.workApi.listWhiteboards(this.selectedBoardId()));
        this.boards.set(boards);
      } else {
        this.boards.set(this.loadLocalBoards());
      }
      const selected = this.selectedWhiteboardId();
      const next = selected && this.boards().some(board => board.id === selected)
        ? this.boards().find(board => board.id === selected)!
        : this.boards()[0] ?? null;
      if (next) {
        this.selectWhiteboard(next);
      } else {
        this.closeEvents();
        this.selectedWhiteboardId.set(null);
        this.selectedElementId.set(null);
        this.content.set(EMPTY_CONTENT);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async createWhiteboard(): Promise<void> {
    if (!await this.canLeave()) return;
    const boardId = this.selectedBoardId();
    const payload: WhiteboardPayload = {
      projectId: boardId,
      name: 'Nueva pizarra',
      description: '',
      contentJson: JSON.stringify(EMPTY_CONTENT),
    };
    const board = environment.useApi
      ? await firstValueFrom(this.workApi.createWhiteboard(payload))
      : this.createLocalBoard(payload);
    this.upsertBoard(board);
    this.persistLocalBoards();
    this.selectWhiteboard(board);
  }

  async selectWhiteboard(board: WhiteboardDto): Promise<void> {
    if (board.id === this.selectedWhiteboardId()) return;
    if (!await this.canLeave()) return;
    this.closeEvents();
    this.selectedWhiteboardId.set(board.id);
    this.selectedElementId.set(null);
    this.boardName.set(board.name);
    this.boardDescription.set(board.description ?? '');
    this.content.set(this.parseContent(board.contentJson));
    this.lastSyncedAt.set(board.updatedAt);
    this.connectEvents(board.id);
  }

  async deleteWhiteboard(): Promise<void> {
    const id = this.selectedWhiteboardId();
    if (!id || !await this.canLeave()) {
      return;
    }
    this.closeEvents();
    if (environment.useApi) {
      await firstValueFrom(this.workApi.deleteWhiteboard(id));
    }
    this.boards.set(this.boards().filter(board => board.id !== id));
    this.persistLocalBoards();
    const next = this.boards()[0];
    if (next) {
      this.selectWhiteboard(next);
    } else {
      await this.createWhiteboard();
    }
  }

  addElement(type: WhiteboardElementType): void {
    const element: WhiteboardElement = {
      id: crypto.randomUUID(),
      type,
      x: 120 + this.elements().length * 24,
      y: 120 + this.elements().length * 18,
      width: type === 'text' ? 220 : 240,
      height: type === 'text' ? 90 : 140,
      text: type === 'block' ? 'Bloque' : type === 'text' ? 'Texto' : 'Nota',
      color: type === 'block' ? '#dbeafe' : type === 'text' ? '#ffffff' : '#fef3c7',
    };
    this.content.update(content => ({ elements: [...content.elements, element] }));
    this.selectedElementId.set(element.id);
    this.scheduleSave();
  }

  beginPointer(event: PointerEvent, element: WhiteboardElement, mode: PointerMode): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedElementId.set(element.id);
    this.pointerState = {
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originalX: element.x,
      originalY: element.y,
      originalWidth: element.width,
      originalHeight: element.height,
    };
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.pointerState) {
      return;
    }
    const pointer = this.pointerState;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (pointer.mode === 'move') {
      this.updateElement(pointer.id, {
        x: Math.max(0, pointer.originalX + dx),
        y: Math.max(0, pointer.originalY + dy),
      }, false);
    } else {
      this.updateElement(pointer.id, {
        width: Math.max(120, pointer.originalWidth + dx),
        height: Math.max(72, pointer.originalHeight + dy),
      }, false);
    }
  }

  @HostListener('document:pointerup')
  onPointerUp(): void {
    if (!this.pointerState) {
      return;
    }
    this.pointerState = null;
    this.scheduleSave();
  }

  updateSelectedText(text: string): void {
    const selected = this.selectedElement();
    if (!selected) {
      return;
    }
    this.updateElement(selected.id, { text });
  }

  updateSelectedColor(color: string): void {
    const selected = this.selectedElement();
    if (!selected) {
      return;
    }
    this.updateElement(selected.id, { color });
  }

  deleteSelectedElement(): void {
    const selected = this.selectedElementId();
    if (!selected) {
      return;
    }
    this.content.update(content => ({
      elements: content.elements.filter(element => element.id !== selected),
    }));
    this.selectedElementId.set(null);
    this.scheduleSave();
  }

  scheduleSave(): void {
    if (!this.selectedWhiteboardId()) return;
    this.dirty = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveCurrentWhiteboard();
    }, 450);
  }

  canLeave(): Promise<boolean> {
    return this.saveCurrentWhiteboard();
  }

  @HostListener('window:beforeunload', ['$event'])
  protectPendingSave(event: BeforeUnloadEvent): void {
    if ((this.dirty || this.saving()) && this.authService.isAuthenticated()) event.preventDefault();
  }

  saveCurrentWhiteboard(): Promise<boolean> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.saveInFlight) return this.saveInFlight;
    if (!this.dirty) return Promise.resolve(true);
    this.saving.set(true);
    this.saveError.set(false);
    this.saveInFlight = this.flushChanges().catch(() => {
      this.dirty = true;
      this.saveError.set(true);
      return false;
    }).finally(() => {
      this.saveInFlight = undefined;
      this.saving.set(false);
    });
    return this.saveInFlight;
  }

  private async flushChanges(): Promise<boolean> {
    while (this.dirty) {
      const id = this.selectedWhiteboardId();
      if (!id) return false;
      this.dirty = false;
      const payload: WhiteboardPayload = {
        projectId: this.selectedBoard()?.projectId ?? null,
        name: this.boardName().trim() || 'Pizarra sin titulo',
        description: this.boardDescription(),
        contentJson: JSON.stringify(this.content()),
      };
      const saved = environment.useApi
        ? await firstValueFrom(this.workApi.updateWhiteboard(id, payload))
        : this.updateLocalBoard(id, payload);
      this.upsertBoard(saved);
      if (this.selectedWhiteboardId() === id) this.lastSyncedAt.set(saved.updatedAt);
      this.persistLocalBoards();
    }
    return true;
  }

  async applyBoardFilter(): Promise<void> {
    if (!await this.canLeave()) return;
    await this.loadWhiteboards();
  }

  formatSyncDate(value: string | null): string {
    if (!value) {
      return '';
    }
    return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  private updateElement(id: string, patch: Partial<WhiteboardElement>, shouldSave = true): void {
    this.content.update(content => ({
      elements: content.elements.map(element =>
        element.id === id ? { ...element, ...patch } : element
      ),
    }));
    if (shouldSave) {
      this.scheduleSave();
    }
  }

  private connectEvents(id: string): void {
    if (!environment.useApi) {
      return;
    }
    const token = this.authService.getToken();
    if (!token) {
      return;
    }
    const connection = new AbortController();
    this.eventAbort = connection;
    void this.readEvents(id, token, connection);
  }

  private closeEvents(): void {
    this.eventAbort?.abort();
    this.eventAbort = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async readEvents(id: string, token: string, connection: AbortController): Promise<void> {
    let retry = true;
    try {
      const stream = await fetch(this.workApi.whiteboardEventsUrl(id), {
        headers: {Authorization: `Bearer ${token}`, Accept: 'text/event-stream'},
        signal: connection.signal,
        redirect: 'error',
      });
      if ([401, 403, 404].includes(stream.status)) { retry = false; return; }
      if (!stream.ok || !stream.body) return;
      const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        while (!connection.signal.aborted) {
          const {done, value} = await reader.read();
          if (done) break;
          buffer += value;
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) this.handleEvent(frame, id);
          if (buffer.length > 2_000_000) break;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    } catch {
      // A failed stream is reopened while the same board is selected.
    } finally {
      if (retry && !connection.signal.aborted && this.eventAbort === connection && this.selectedWhiteboardId() === id) {
        this.reconnectTimer = setTimeout(() => this.connectEvents(id), 3000);
      }
    }
  }

  private handleEvent(frame: string, id: string): void {
    if (id !== this.selectedWhiteboardId()) return;
    const lines = frame.split(/\r?\n/);
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    if (event === 'deleted') { void this.loadWhiteboards(); return; }
    if (event !== 'whiteboard') return;
    try {
      const board = JSON.parse(lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')) as WhiteboardDto;
      if (board.id !== id) return;
      this.upsertBoard(board);
      if (this.saving() || this.dirty) return;
      this.boardName.set(board.name);
      this.boardDescription.set(board.description ?? '');
      this.content.set(this.parseContent(board.contentJson));
      this.lastSyncedAt.set(board.updatedAt);
    } catch {
      // A malformed event is discarded without closing the stream.
    }
  }

  private parseContent(value: string): WhiteboardContent {
    try {
      const parsed = JSON.parse(value) as WhiteboardContent;
      return { elements: Array.isArray(parsed.elements) ? parsed.elements : [] };
    } catch {
      return EMPTY_CONTENT;
    }
  }

  private upsertBoard(board: WhiteboardDto): void {
    this.boards.update(boards =>
      boards.some(item => item.id === board.id)
        ? boards.map(item => item.id === board.id ? board : item)
        : [board, ...boards]
    );
  }

  private createLocalBoard(payload: WhiteboardPayload): WhiteboardDto {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      projectId: payload.projectId ?? null,
      projectName: this.workService.getBoard(payload.projectId ?? '')?.name ?? null,
      name: payload.name ?? 'Nueva pizarra',
      description: payload.description ?? '',
      contentJson: payload.contentJson ?? JSON.stringify(EMPTY_CONTENT),
      updatedByName: 'Local',
      createdAt: now,
      updatedAt: now,
    };
  }

  private updateLocalBoard(id: string, payload: WhiteboardPayload): WhiteboardDto {
    const current = this.boards().find(board => board.id === id) ?? this.createLocalBoard(payload);
    return {
      ...current,
      projectId: payload.projectId ?? current.projectId,
      projectName: this.workService.getBoard(payload.projectId ?? '')?.name ?? current.projectName,
      name: payload.name ?? current.name,
      description: payload.description ?? current.description,
      contentJson: payload.contentJson ?? current.contentJson,
      updatedAt: new Date().toISOString(),
    };
  }

  private loadLocalBoards(): WhiteboardDto[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as WhiteboardDto[];
      }
    } catch {
      /* default */
    }
    const seed = this.createLocalBoard({
      name: 'Mapa de trabajo',
      description: '',
      contentJson: JSON.stringify({
        elements: [{
          id: crypto.randomUUID(),
          type: 'note',
          x: 140,
          y: 120,
          width: 250,
          height: 140,
          text: 'Ideas, riesgos y acuerdos',
          color: '#fef3c7',
        }],
      }),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([seed]));
    return [seed];
  }

  private persistLocalBoards(): void {
    if (!environment.useApi) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.boards()));
    }
  }
}

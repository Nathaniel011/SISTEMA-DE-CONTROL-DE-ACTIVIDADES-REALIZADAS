import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {Select} from 'primeng/select';
import {InputText} from 'primeng/inputtext';
import {HttpErrorResponse} from '@angular/common/http';
import {WorkService} from '../../../core/services/work.service';
import {interval} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {WorkCard, WORK_STATUS_LABELS} from '../work.models';
import {formatWorkDate, boardDisplayName, WORK_DRAFT_CARD_TITLE} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';
import {WorkWritingField} from '../work-writing-field/work-writing-field';
import {WorkSkeleton} from '../work-skeleton/work-skeleton';
import {debouncedAction} from '../../../core/timing/debounced-action';

const QUEUES = [
  {id: 'reception', label: 'Por derivar', icon: 'pi pi-inbox'},
  {id: 'unassigned', label: 'Sin asignar', icon: 'pi pi-user-minus'},
  {id: 'risk', label: 'SLA en riesgo', icon: 'pi pi-clock'},
  {id: 'all', label: 'Todas', icon: 'pi pi-list'},
] as const;
type Queue = (typeof QUEUES)[number]['id'];

@Component({
  selector: 'app-work-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Button,
    Dialog,
    Select,
    InputText,
    WorkCardDrawer,
    WorkWritingField,
    WorkSkeleton,
  ],
  templateUrl: './work-inbox.html',
})
export class WorkInbox {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  workService = inject(WorkService);

  readonly queues = QUEUES;
  private params = toSignal(this.route.queryParamMap, {initialValue: this.route.snapshot.queryParamMap});
  private readonly tick = toSignal(interval(60_000), {initialValue: 0});
  private readonly now = computed(() => { this.tick(); return Date.now(); });
  search = computed(() => this.params().get('q') ?? '');
  assigneeFilter = computed(() => this.params().get('assignee'));
  channel = computed(() => this.params().get('channel'));
  queue = computed(() => QUEUES.find(item => item.id === this.params().get('queue'))?.id ?? 'reception');
  selectedCardId = computed(() => this.params().get('issue'));
  drawerOpen = computed(() => !!this.selectedCardId() && !!this.workService.getCard(this.selectedCardId()!));
  createError = signal<string | null>(null);
  inboxLoading = signal(false);
  inboxError = signal(false);
  createOpen = signal(false);
  incomingTitle = signal('');
  incomingDescription = signal('');
  incomingName = signal('');
  incomingEmail = signal('');
  incomingChannel = signal('oficina');
  creating = signal(false);
  announcement = signal('');
  showAssignDialog = signal(false);
  assigningCardId = signal<string | null>(null);
  selectedBoardId = signal<string | null>(null);
  selectedAssigneeId = signal<string | null>(null);
  assigning = signal(false);
  assignError = signal<string | null>(null);
  channelOptions = [
    {label: 'Oficina', value: 'oficina'},
    {label: 'Teléfono', value: 'telefono'},
    {label: 'Formulario web', value: 'web'},
    {label: 'Correo', value: 'email'},
  ];
  channelFilterOptions = [{label: 'Todos los canales', value: null}, ...this.channelOptions];

  boardOptions = computed(() =>
    this.workService.standardBoards().map(b => ({
      label: boardDisplayName(b),
      value: b.id,
    }))
  );

  assignMemberOptions = computed(() => {
    const boardId = this.selectedBoardId();
    if (!boardId) return [];
    const board = this.workService.getBoard(boardId);
    if (!board) return [];
    const boardMembers = this.workService.members().filter(m => board.memberIds.includes(m.id));
    const eligible = new Set(this.workService.assignableMembers().map(member => member.id));
    return boardMembers
      .filter(member => eligible.has(member.id))
      .map(m => ({ label: m.name, value: m.id }));
  });

  canConfirmAssign = computed(
    () => !!this.selectedBoardId() && !!this.selectedAssigneeId() && !this.assigning()
  );

  memberFilterOptions = computed(() => [
    { label: 'Todos', value: null },
    ...this.workService.members().map(m => ({ label: m.name, value: m.id })),
  ]);
  private readonly matching = computed(() => this.workService.filterIssues(this.workService.cards(), 'all', 'all', this.search())
    .filter(card => card.helpdeskRequest || (!environment.useApi && card.boardId === this.workService.getGeneralBoardId()))
    .filter(card => card.title !== WORK_DRAFT_CARD_TITLE)
    .filter(card => !this.assigneeFilter() || card.assigneeId === this.assigneeFilter())
    .filter(card => !this.channel() || this.channelKey(card) === this.channel()));
  counts = computed(() => Object.fromEntries(QUEUES.map(({id}) => [id, this.matching().filter(card => this.inQueue(card, id)).length])));
  results = computed(() => this.matching().filter(card => this.inQueue(card, this.queue())).sort((a, b) =>
    Date.parse(a.sla?.resolutionDueAt ?? a.createdAt) - Date.parse(b.sla?.resolutionDueAt ?? b.createdAt)));

  constructor() {
    void this.loadInbox();
  }

  async loadInbox(): Promise<void> {
    if (this.inboxLoading()) return;
    this.inboxLoading.set(true);
    this.inboxError.set(false);
    try {
      await this.workService.ensureAllCards(true);
    } catch {
      this.inboxError.set(true);
    } finally {
      this.inboxLoading.set(false);
    }
  }

  private readonly searchDelay = debouncedAction(270);

  setFilter(key: string, value: string | null): void {
    if (key === 'q') {
      this.searchDelay.schedule(() => this.applyFilter(key, value));
      return;
    }
    this.applyFilter(key, value);
  }

  private applyFilter(key: string, value: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {[key]: value || null},
      queryParamsHandling: 'merge',
      replaceUrl: key === 'q',
    });
  }

  private inQueue(card: WorkCard, queue: Queue): boolean {
    const open = card.columnId !== 'closed' && card.columnId !== 'done';
    if (queue === 'reception') return this.canRoute(card);
    if (queue === 'unassigned') return open && !card.assigneeId;
    if (queue === 'risk') return open && !!this.slaLabel(card);
    return true;
  }

  canRoute(card: WorkCard): boolean {
    return card.boardId === this.workService.getGeneralBoardId() &&
      (card.columnId === 'registered' || card.columnId === 'in_assignment' || card.columnId === 'todo');
  }

  slaLabel(card: WorkCard): string | null {
    const sla = card.sla;
    if (!sla || sla.resolvedAt || card.columnId === 'done' || card.columnId === 'closed') return null;
    const deadline = Math.min(Date.parse(sla.resolutionDueAt), card.publicTrackingEnabled && !sla.firstReplyAt
      ? Date.parse(sla.firstReplyDueAt) : Infinity);
    if (deadline <= this.now()) return 'SLA vencido';
    return deadline <= this.now() + 3_600_000 ? 'SLA próximo a vencer' : null;
  }

  channelKey(card: WorkCard): string {
    return card.receptionChannel === 'correo' ? 'email' : card.receptionChannel ?? '';
  }

  channelLabel(card: WorkCard): string {
    return this.channelOptions.find(item => item.value === this.channelKey(card))?.label ?? 'Sin canal';
  }

  openCreateCard(): void {
    if (!this.workService.canAssignTasks()) return;
    this.createError.set(null);
    this.createOpen.set(true);
  }

  async registerRequest(): Promise<void> {
    const title = this.incomingTitle().trim();
    if (!title || this.creating() || !this.workService.getGeneralBoardId()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const card = await this.workService.createIncomingNote(title, {
        description: this.incomingDescription().trim(),
        requesterName: this.incomingName().trim(),
        requesterEmail: this.incomingEmail().trim() || undefined,
        receptionChannel: this.incomingChannel(),
      });
      this.incomingTitle.set('');
      this.incomingDescription.set('');
      this.incomingName.set('');
      this.incomingEmail.set('');
      this.createOpen.set(false);
      this.announcement.set(`${this.workService.getIssueKey(card)} · Solicitud registrada`);
    } catch {
      this.createError.set('No se pudo registrar la solicitud. Inténtalo de nuevo.');
    } finally {
      this.creating.set(false);
    }
  }

  onDrawerVisibleChange(open: boolean): void {
    if (!open) this.setFilter('issue', null);
  }

  openAssignDialog(card: WorkCard): void {
    if (!this.workService.canAssignTasks()) return;
    this.assigningCardId.set(card.id);
    this.selectedBoardId.set(null);
    this.selectedAssigneeId.set(null);
    this.assignError.set(null);
    this.showAssignDialog.set(true);
  }

  closeAssignDialog(): void {
    this.showAssignDialog.set(false);
    this.assigningCardId.set(null);
    this.selectedBoardId.set(null);
    this.selectedAssigneeId.set(null);
    this.assignError.set(null);
  }

  onAssignBoardChange(boardId: string | null): void {
    this.selectedBoardId.set(boardId);
    this.selectedAssigneeId.set(null);
  }

  async saveAssignment(): Promise<void> {
    const cardId = this.assigningCardId();
    const boardId = this.selectedBoardId();
    const assigneeId = this.selectedAssigneeId();
    if (!cardId || !boardId || !assigneeId || this.assigning()) return;

    this.assigning.set(true);
    this.assignError.set(null);
    try {
      const updated = await this.workService.assignIncomingIssue(cardId, boardId, assigneeId);
      if (updated) this.announcement.set(`${this.workService.getIssueKey(updated)} · Solicitud asignada y enviada`);
      this.closeAssignDialog();
    } catch (err) {
      const message =
        err instanceof HttpErrorResponse && typeof err.error?.message === 'string' ? err.error.message : '';
      this.assignError.set(message || 'No se pudo asignar. Verifica el tablero y el responsable.');
    } finally {
      this.assigning.set(false);
    }
  }

  formatDate = formatWorkDate;
  labels = WORK_STATUS_LABELS;
}

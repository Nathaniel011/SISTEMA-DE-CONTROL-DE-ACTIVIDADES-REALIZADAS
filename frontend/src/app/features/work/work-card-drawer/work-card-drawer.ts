import {ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, model, signal, untracked} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {DOCUMENT, NgTemplateOutlet} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Router, RouterLink} from '@angular/router';
import {Dialog} from 'primeng/dialog';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {Select} from 'primeng/select';
import {DatePicker} from 'primeng/datepicker';
import {InputNumber} from 'primeng/inputnumber';
import {Avatar} from 'primeng/avatar';
import {Tag} from 'primeng/tag';
import {WorkService} from '../../../core/services/work.service';
import {WorkCardDetailStore} from '../../../core/services/work-card-detail.store';
import {PermissionsService} from '../../../core/services/permissions.service';
import {WORK_PRIORITIES, WORK_STATUS_LABELS, WorkCard, WorkColumnId} from '../work.models';
import {IssueFieldValues} from '../../../core/services/project-configuration-api.service';
import {
  formatWorkDate,
  formatWorkMinutes,
  parseWorkDate,
  formatWorkDateISO,
  priorityMeta,
  boardDisplayName,
  WORK_DRAFT_CARD_TITLE,
} from '../work.utils';
import {WorkCardAttachments} from '../work-card-attachments/work-card-attachments';
import {WorkCardTimePanel} from '../work-card-time-panel/work-card-time-panel';
import {WorkWritingField} from '../work-writing-field/work-writing-field';
import {WorkProjectFields} from '../work-project-fields/work-project-fields';

@Component({
  selector: 'app-work-card-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    Dialog,
    Button,
    InputText,
    Textarea,
    Select,
    DatePicker,
    Avatar,
    Tag,
    WorkCardAttachments,
    WorkCardTimePanel,
    WorkWritingField,
    WorkProjectFields,
  ],
  templateUrl: './work-card-drawer.html',
})
export class WorkCardDrawer {
  private cdr = inject(ChangeDetectorRef);
  private document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private opener: HTMLElement | null = null;
  private pendingNavigation: ((allowed: boolean) => void) | undefined;
  workService = inject(WorkService);
  detailStore = inject(WorkCardDetailStore);
  permissions = inject(PermissionsService);

  cardId = input<string | null>(null);
  fullPage = input(false);
  discardDraftOnClose = input(true);
  visible = model(false);

  commentText = signal('');
  publicReply = signal(false);
  commentPending = signal(false);
  commentError = signal('');
  readonly responseTemplates = [
    {label: 'Confirmar recepción', value: 'Recibimos tu solicitud. La revisaremos y te informaremos del avance por este medio.'},
    {label: 'Solicitar más información', value: 'Para continuar, necesitamos que nos indiques más detalles sobre la solicitud.'},
    {label: 'Confirmar resolución', value: 'Hemos atendido tu solicitud. Gracias por comunicarte con nosotros.'},
  ];
  subtaskTitle = signal('');
  showTimePanel = signal(false);
  discardDialogOpen = signal(false);
  activityTab = signal<'comments' | 'history' | 'time'>('comments');
  deleteDialogOpen = signal(false);
  deletingCard = signal(false);
  deleteError = signal<string | null>(null);

  titleDraft = signal('');
  editingText = signal(false);
  descriptionDraft = signal('');
  priorityDraft = signal<WorkCard['priority']>('medium');
  assigneeIdDraft = signal<string | null>(null);
  boardListIdDraft = signal<string | null>(null);
  stateDraft = signal<WorkColumnId | null>(null);
  fieldDraft = signal<IssueFieldValues>({});
  startDateDraft = signal<Date | null>(null);
  endDateDraft = signal<Date | null>(null);
  dueDateDraft = signal<Date | null>(null);
  issueTypeDraft = signal('');
  observationsDraft = signal('');
  saving = signal(false);
  saveError = signal<string | null>(null);
  private syncedCardId = signal<string | null>(null);
  transferError = signal<string | null>(null);
  transferring = signal(false);
  moveDialogOpen = signal(false);
  moveBoardId = signal<string | null>(null);
  moveListId = signal<string | null>(null);
  moveAssigneeId = signal<string | null>(null);

  card = computed(() => {
    const id = this.cardId();
    return id ? this.workService.getCard(id) : undefined;
  });

  cardDetail = computed(() => this.detailStore.snapshot(this.cardId()));
  readonlyIssue = computed(() => this.cardDetail().loaded && !this.cardDetail().canEdit);
  projectFields = computed(() => this.cardDetail().customFields.map(entry => entry.field));
  customFieldValues = computed(() => ({
    ...Object.fromEntries(this.cardDetail().customFields.map(entry => [entry.field.id, entry.value])),
    ...this.fieldDraft(),
  }));
  stateOptions = computed(() => {
    const card = this.card();
    if (!card) return [];
    return [card.columnId, ...this.workService.allowedStates(card)]
      .map(state => ({label: WORK_STATUS_LABELS[state], value: state}));
  });

  openPageParams() {
    const context = this.router.parseUrl(this.router.url);
    delete context.queryParams['issue'];
    return {returnTo: this.router.serializeUrl(context)};
  }

  setCustomField(id: string, value: string | null): void {
    const baseline = this.cardDetail().customFields.find(entry => entry.field.id === id)?.value ?? null;
    this.fieldDraft.update(current => {
      const next = {...current};
      if (value === baseline) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  toggleTextEditor(): void {
    if (this.editingText()) {
      this.titleDraft.set(this.card()?.title ?? '');
      this.descriptionDraft.set(this.card()?.description ?? '');
    }
    this.editingText.update(value => !value);
  }

  isDraftCard = computed(() => {
    const c = this.card();
    return !!c && c.title === WORK_DRAFT_CARD_TITLE;
  });

  board = computed(() => {
    const c = this.card();
    return c ? this.workService.getBoard(c.boardId) : undefined;
  });

  listName = computed(() => {
    const listId = this.boardListIdDraft() ?? this.card()?.boardListId;
    if (listId) {
      const list = this.workService.boardLists().find(l => l.id === listId);
      return list?.name ?? 'Sin lista';
    }
    const c = this.card();
    if (c) return this.statusLabel(c.columnId);
    return 'Nueva tarjeta';
  });

  listOptions = computed(() => {
    const boardId = this.card()?.boardId;
    if (!boardId) return [];
    return this.workService.getBoardLists(boardId).map(list => ({
      label: list.name,
      value: list.id,
    }));
  });

  memberOptions = computed(() => this.boardMemberSelectOptions(this.board()?.id));

  canChangeAssignee = computed(
    () => this.workService.canAssignTasks() || this.memberOptions().length > 0
  );

  moveBoardOptions = computed(() =>
    this.workService.boards().map(b => ({ label: boardDisplayName(b), value: b.id }))
  );

  moveListOptions = computed(() => {
    const boardId = this.moveBoardId();
    if (!boardId) return [];
    return this.workService.getBoardLists(boardId).map(list => ({
      label: list.name,
      value: list.id,
    }));
  });

  moveMemberOptions = computed(() => this.boardMemberSelectOptions(this.moveBoardId()));

  canChangeMoveAssignee = computed(
    () => this.workService.canAssignTasks() || this.moveMemberOptions().length > 0
  );

  comments = computed(() => {
    const detail = this.cardDetail();
    if (detail.loaded) return detail.comments;
    return this.card()?.comments ?? [];
  });

  activityLabels: Record<string, string> = {
    column: 'Estado',
    assignee: 'Responsable',
    priority: 'Prioridad',
    due_date: 'Vencimiento',
    planned_dates: 'Fechas planificadas',
    estimate: 'Estimación (minutos)',
    transfer: 'Traslado de proyecto',
    custom_fields: 'Campos del proyecto',
  };

  activityValue(action: string, value: string | null): string {
    if (!value) return 'Sin valor';
    if (action === 'column' && value in WORK_STATUS_LABELS) {
      return WORK_STATUS_LABELS[value as keyof typeof WORK_STATUS_LABELS];
    }
    if (action === 'priority') return priorityMeta(value as WorkCard['priority']).label;
    if (action === 'due_date') return formatWorkDate(value);
    return value;
  }

  formatActivityDate(value: string): string {
    return new Date(value).toLocaleString('es-BO', {dateStyle: 'medium', timeStyle: 'short'});
  }

  onDetailEscape(event: Event): void {
    if (!this.hasUnsavedChanges() && !this.commentText().trim()) return;
    event.stopPropagation();
    void this.close();
  }

  restoreFocus(): void {
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  priorityOptions = WORK_PRIORITIES.map(p => ({ label: p.label, value: p.value }));
  canDelete = computed(() => this.workService.canDeleteIssues() && !!this.cardId());

  hasUnsavedChanges = computed(() => {
    const c = this.card();
    if (!c) return false;

    const startIso = this.startDateDraft() ? formatWorkDateISO(this.startDateDraft()!) : null;
    const endIso = this.endDateDraft() ? formatWorkDateISO(this.endDateDraft()!) : null;
    const dueIso = this.dueDateDraft() ? formatWorkDateISO(this.dueDateDraft()!) : null;
    const title = this.normalizedTitleDraft(c);
    const issueType = this.issueTypeDraft().trim();

    return (
      title !== c.title ||
      this.descriptionDraft().trim() !== (c.description ?? '').trim() ||
      startIso !== (c.startDate ?? null) ||
      endIso !== (c.endDate ?? null) ||
      dueIso !== (c.dueDate ?? null) ||
      issueType !== (c.issueType ?? '').trim() ||
      this.observationsDraft().trim() !== (c.observations ?? '').trim() ||
      this.priorityDraft() !== c.priority ||
      this.stateDraft() !== c.columnId ||
      Object.keys(this.fieldDraft()).length > 0 ||
      this.assigneeIdDraft() !== (c.assigneeId ?? null) ||
      this.boardListIdDraft() !== (c.boardListId ?? null)
    );
  });

  canSave = computed(() => {
    const c = this.card();
    if (!c || this.readonlyIssue()) return false;
    const title = this.normalizedTitleDraft(c);
    if (!title || title === WORK_DRAFT_CARD_TITLE) return false;
    if (this.isDraftCard()) return true;
    return this.hasUnsavedChanges();
  });

  saveButtonLabel = computed(() => (this.isDraftCard() ? 'Crear' : 'Guardar'));

  constructor() {
    effect(() => {
      const id = this.cardId();
      const c = this.card();
      const open = this.visible();
      if (!open || !id || !c) return;
      if (this.syncedCardId() !== id) {
        this.opener = this.document.activeElement as HTMLElement | null;
        this.loadDraftsFromCard(c);
        this.syncedCardId.set(id);
      }
    });

    effect(() => {
      const id = this.cardId();
      const open = this.visible();
      if (open && id) {
        untracked(() => void this.detailStore.load(id, true));
      }
    });

    effect(() => {
      if (!this.visible()) {
        this.syncedCardId.set(null);
        this.saveError.set(null);
        this.activityTab.set('comments');
        this.publicReply.set(false);
        this.commentError.set('');
      }
    });
  }

  private normalizedTitleDraft(c: WorkCard): string {
    const title = this.titleDraft().trim();
    if (title) return title;
    return c.title === WORK_DRAFT_CARD_TITLE ? WORK_DRAFT_CARD_TITLE : '';
  }

  private loadDraftsFromCard(c: WorkCard): void {
    this.titleDraft.set(c.title === WORK_DRAFT_CARD_TITLE ? '' : c.title);
    this.descriptionDraft.set(c.description ?? '');
    this.priorityDraft.set(c.priority);
    this.assigneeIdDraft.set(c.assigneeId ?? null);
    this.boardListIdDraft.set(c.boardListId ?? null);
    this.stateDraft.set(c.columnId);
    this.fieldDraft.set({});
    this.editingText.set(false);
    this.startDateDraft.set(parseWorkDate(c.startDate));
    this.endDateDraft.set(parseWorkDate(c.endDate));
    this.dueDateDraft.set(parseWorkDate(c.dueDate));
    this.issueTypeDraft.set(c.issueType ?? '');
    this.observationsDraft.set(c.observations ?? '');
    this.saveError.set(null);
  }

  async saveAll(): Promise<void> {
    const id = this.cardId();
    const c = this.card();
    if (!id || !c || this.saving() || this.readonlyIssue()) return;

    const title = this.normalizedTitleDraft(c);
    if (!title || title === WORK_DRAFT_CARD_TITLE) {
      this.saveError.set('El título es obligatorio.');
      return;
    }

    if (!this.isDraftCard() && !this.hasUnsavedChanges()) return;

    const startIso = this.startDateDraft() ? formatWorkDateISO(this.startDateDraft()!) : null;
    const endIso = this.endDateDraft() ? formatWorkDateISO(this.endDateDraft()!) : null;
    const dueIso = this.dueDateDraft() ? formatWorkDateISO(this.dueDateDraft()!) : null;
    if (startIso && endIso && startIso > endIso) {
      this.saveError.set('El fin planificado no puede ser anterior al inicio.');
      return;
    }
    const description = this.descriptionDraft().trim();
    const issueType = this.issueTypeDraft().trim();
    const patch: Partial<WorkCard> = {};

    if (title !== c.title) patch.title = title;
    if (description !== (c.description ?? '').trim()) patch.description = description;
    if (startIso !== (c.startDate ?? null)) patch.startDate = startIso ?? '';
    if (endIso !== (c.endDate ?? null)) patch.endDate = endIso ?? '';
    if (dueIso !== (c.dueDate ?? null)) patch.dueDate = dueIso;
    if (issueType !== (c.issueType ?? '').trim()) patch.issueType = issueType || null;
    if (this.observationsDraft().trim() !== (c.observations ?? '').trim()) {
      patch.observations = this.observationsDraft().trim();
    }
    if (this.priorityDraft() !== c.priority) patch.priority = this.priorityDraft();
    if (this.assigneeIdDraft() !== (c.assigneeId ?? null)) {
      patch.assigneeId = this.assigneeIdDraft();
    }
    if (this.stateDraft() && this.stateDraft() !== c.columnId) {
      patch.columnId = this.stateDraft()!;
    } else if (this.boardListIdDraft() !== (c.boardListId ?? null)) {
      patch.boardListId = this.boardListIdDraft();
    }

    const customFields = this.fieldDraft();
    if (!Object.keys(patch).length && !Object.keys(customFields).length) return;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.workService.updateCardAsync(id, patch, customFields);
      const updated = this.workService.getCard(id);
      if (updated) {
        this.loadDraftsFromCard(updated);
        await this.detailStore.load(id, true);
      }
    } catch (error) {
      this.saveError.set(
        error instanceof HttpErrorResponse && error.status === 422
          ? 'El proyecto rechazó el estado o el valor de un campo. Revisa la configuración y vuelve a intentarlo.'
          : this.isDraftCard()
          ? 'No se pudo crear la tarjeta. Inténtalo de nuevo.'
          : 'No se pudo guardar la tarjeta. Inténtalo de nuevo.'
      );
    } finally {
      this.saving.set(false);
      this.cdr.markForCheck();
    }
  }

  async close(): Promise<void> {
    if (this.saving()) return;
    if (this.hasUnsavedChanges() || this.commentText().trim()) {
      this.discardDialogOpen.set(true);
      return;
    }
    const id = this.cardId();
    if (id && this.discardDraftOnClose() && this.isDiscardableDraft()) {
      try {
        await this.workService.deleteCard(id);
        this.detailStore.invalidate(id);
      } catch {
        // Si falla el borrado del borrador, cerramos igualmente.
      }
    }
    this.finishClosing();
  }

  confirmNavigation(): boolean | Promise<boolean> {
    if (!this.visible()) return true;
    if (this.saving()) return false;
    if (!this.hasUnsavedChanges() && !this.commentText().trim()) return true;
    this.pendingNavigation?.(false);
    return new Promise(resolve => {
      this.pendingNavigation = resolve;
      this.discardDialogOpen.set(true);
    });
  }

  cancelDiscard(): void {
    this.discardDialogOpen.set(false);
    const resolve = this.pendingNavigation;
    this.pendingNavigation = undefined;
    resolve?.(false);
  }

  discardAndClose(): void {
    this.discardDialogOpen.set(false);
    this.commentText.set('');
    const resolve = this.pendingNavigation;
    this.pendingNavigation = undefined;
    if (resolve) {
      resolve(true);
      return;
    }
    this.finishClosing();
  }

  private finishClosing(): void {
    this.visible.set(false);
    this.showTimePanel.set(false);
  }

  private isDiscardableDraft(): boolean {
    const c = this.card();
    if (!c || c.title !== WORK_DRAFT_CARD_TITLE) return false;
    if (this.hasUnsavedChanges()) return false;
    if ((c.comments?.length ?? 0) > 0) return false;
    if ((c.attachments?.length ?? 0) > 0) return false;
    if (c.trackedMinutes > 0) return false;
    const detail = this.cardDetail();
    if (detail.loaded) {
      if (detail.attachments.length > 0) return false;
      if (detail.comments.length > 0) return false;
    }
    return true;
  }

  openMoveDialog(): void {
    const c = this.card();
    if (!c) return;
    this.moveBoardId.set(c.boardId);
    this.moveListId.set(c.boardListId ?? this.defaultListIdForBoard(c.boardId));
    this.moveAssigneeId.set(c.assigneeId);
    this.transferError.set(null);
    this.moveDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  closeMoveDialog(): void {
    this.moveDialogOpen.set(false);
    this.transferError.set(null);
  }

  onMoveBoardChange(boardId: string): void {
    this.moveBoardId.set(boardId);
    const lists = this.workService.getBoardLists(boardId);
    const currentList = this.moveListId();
    const listStillValid = currentList && lists.some(l => l.id === currentList);
    this.moveListId.set(listStillValid ? currentList : this.defaultListIdForBoard(boardId));

    const board = this.workService.getBoard(boardId);
    const assignee = this.moveAssigneeId();
    if (assignee && board && !board.memberIds.includes(assignee)) {
      this.moveAssigneeId.set(null);
    }
  }

  async confirmMove(): Promise<void> {
    const c = this.card();
    const id = this.cardId();
    const targetBoardId = this.moveBoardId();
    const targetListId = this.moveListId();
    if (!c || !id || !targetBoardId || !targetListId || this.transferring()) return;

    const targetAssigneeId = this.moveAssigneeId();
    const boardChanged = targetBoardId !== c.boardId;
    const listChanged = targetListId !== c.boardListId;
    const assigneeChanged = targetAssigneeId !== c.assigneeId;

    if (!boardChanged && !listChanged && !assigneeChanged) {
      this.closeMoveDialog();
      return;
    }

    this.transferring.set(true);
    this.transferError.set(null);
    try {
      if (boardChanged) {
        await this.workService.moveCardToBoard(id, targetBoardId, 'todo', undefined, targetListId);
      } else if (listChanged) {
        await this.workService.updateCardAsync(id, { boardListId: targetListId });
      }

      if (assigneeChanged) {
        await this.workService.updateCardAsync(id, { assigneeId: targetAssigneeId });
      }

      this.closeMoveDialog();
      if (boardChanged) {
        this.visible.set(false);
      }
    } catch {
      this.transferError.set('No se pudo mover la tarjeta. Verifica tablero, lista y responsable.');
    } finally {
      this.transferring.set(false);
      this.cdr.markForCheck();
    }
  }

  private boardMemberSelectOptions(boardId: string | null | undefined): { label: string; value: string }[] {
    if (!boardId) return [];
    const board = this.workService.getBoard(boardId);
    const boardMembers = board
      ? this.workService.members().filter(m => board.memberIds.includes(m.id))
      : [];

    let members = boardMembers;
    if (this.workService.canAssignTasks()) {
      if (this.permissions.isSecretary()) {
        members = this.workService.staffMembers().filter(m => boardMembers.some(b => b.id === m.id));
      }
    } else {
      const selfId = this.workService.currentMemberId();
      members = selfId ? boardMembers.filter(m => m.id === selfId) : [];
    }

    return members.map(m => ({ label: m.name, value: m.id }));
  }

  private defaultListIdForBoard(boardId: string): string | null {
    const lists = this.workService.getBoardLists(boardId);
    return lists.find(l => l.name.toLowerCase() === 'tarea')?.id ?? lists[0]?.id ?? null;
  }

  async addComment(): Promise<void> {
    const id = this.cardId();
    const text = this.commentText().trim();
    if (!id || !text || this.commentPending()) return;
    this.commentPending.set(true);
    this.commentError.set('');
    try {
      const comment = await this.workService.addComment(id, text, this.publicReply());
      if (comment) this.detailStore.addComment(id, comment);
      if (this.cardId() === id) {
        this.commentText.set('');
        this.publicReply.set(false);
      }
    } catch {
      if (this.cardId() === id) this.commentError.set('No se pudo guardar el mensaje. Conservamos tu texto.');
    } finally {
      this.commentPending.set(false);
    }
  }

  addTemplate(text: string): void {
    const current = this.commentText();
    const next = current.trim() ? `${current.trimEnd()}\n\n${text}` : text;
    if (next.length <= 10000) this.commentText.set(next);
  }

  readonly slaDate = (value: string): string => new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value));

  createSubtask(): void {
    const id = this.cardId();
    const title = this.subtaskTitle().trim();
    if (!id || !title) return;
    this.workService.createSubtask(id, title);
    this.subtaskTitle.set('');
  }

  openDeleteDialog(): void {
    this.deleteError.set(null);
    this.deleteDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.deleteDialogOpen.set(false);
    this.deleteError.set(null);
  }

  async executeDelete(): Promise<void> {
    const id = this.cardId();
    if (!id || this.deletingCard()) return;
    this.deletingCard.set(true);
    this.deleteError.set(null);
    try {
      await this.workService.deleteCard(id);
      this.detailStore.invalidate(id);
      this.deleteDialogOpen.set(false);
      this.visible.set(false);
    } catch (error) {
      this.deleteError.set(this.resolveDeleteError(error));
    } finally {
      this.deletingCard.set(false);
    }
  }

  statusLabel(columnId: WorkCard['columnId']): string {
    return WORK_STATUS_LABELS[columnId] ?? columnId;
  }

  private resolveDeleteError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }
      const message = (error.error as { message?: string } | null)?.message;
      if (message) {
        return message;
      }
      if (error.status === 403) {
        return 'No tienes permiso para eliminar esta tarjeta.';
      }
      if (error.status === 404) {
        return 'La tarjeta ya no existe.';
      }
    }
    return 'No se pudo eliminar la tarjeta. Inténtalo de nuevo.';
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  priorityMeta = priorityMeta;
  boardDisplayName = boardDisplayName;
}

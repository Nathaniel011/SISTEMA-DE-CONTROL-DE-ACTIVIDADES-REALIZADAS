import {Component, EventEmitter, Input, Output, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {Select} from 'primeng/select';
import {DatePicker} from 'primeng/datepicker';
import {InputNumber} from 'primeng/inputnumber';
import {Button} from 'primeng/button';
import {WorkService} from '../../../core/services/work.service';
import {
  AGILE_COLUMNS,
  WorkAttachment,
  WorkColumnId,
  WorkCard,
  WorkIssueType,
  WORK_ISSUE_TYPES,
  WorkPriority,
  WORK_PRIORITIES,
} from '../work.models';

@Component({
  selector: 'app-card-modal',
  standalone: true,
  imports: [FormsModule, Dialog, InputText, Textarea, Select, DatePicker, InputNumber, Button],
  templateUrl: './card-modal.html',
})
export class CardModal {
  private _visible = false;
  @Input()
  get visible() { return this._visible; }
  set visible(v: boolean) { this._visible = v; if (v) this.loadForEdit(); }
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() cardId: string | null = null;

  workService = inject(WorkService);

  title = signal('');
  description = signal('');
  selectedBoard = signal('');
  selectedColumn = signal<WorkColumnId>('todo');
  selectedType = signal<WorkIssueType>('task');
  selectedPriority = signal<WorkPriority>('medium');
  selectedAssignee = signal<string | null>(null);
  dueDate = signal<string | null>(null);
  estimateMinutes = signal<number | null>(null);
  selectedLabels = signal<string[]>([]);
  selectedAttachments = signal<WorkAttachment[]>([]);

  columns = AGILE_COLUMNS;
  columnsOptions = this.columns.map(c => ({ label: c.title, value: c.id }));
  typeOptions = WORK_ISSUE_TYPES.map(t => ({ label: t.label, value: t.value }));
  priorityOptions = WORK_PRIORITIES.map(p => ({ label: p.label, value: p.value }));

  get boardsOptions() {
    return this.workService.boards().map(b => ({ label: b.name, value: b.id }));
  }

  get assigneeOptions() {
    return this.workService.members().map(m => ({ label: m.name, value: m.id }));
  }

  get labelOptions() {
    return this.workService.labels().map(l => ({ label: l.name, value: l.id }));
  }

  get cardKey(): string {
    if (!this.cardId) return '';
    const card = this.workService.getCard(this.cardId);
    return card ? this.workService.getIssueKey(card) : '';
  }

  get attachmentList() {
    return this.selectedAttachments();
  }

  async onFileInputChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    const attachments = await Promise.all(
      files.map(file =>
        new Promise<WorkAttachment>(resolve => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: crypto.randomUUID(),
              fileName: file.name,
              fileUrl: reader.result as string,
              mimeType: file.type,
              fileSize: file.size,
              createdAt: new Date().toISOString(),
            });
          };
          reader.readAsDataURL(file);
        })
      )
    );

    this.selectedAttachments.set([...this.selectedAttachments(), ...attachments]);
    input.value = '';
  }

  removeAttachment(attachmentId: string): void {
    this.selectedAttachments.set(this.selectedAttachments().filter(a => a.id !== attachmentId));
  }

  dueDateValue() {
    return this.dueDate() ? new Date(this.dueDate() + 'T00:00:00') : null;
  }

  ngOnChanges(): void {
    this.loadForEdit();
  }

  open(): void {
    this.visible = true;
    this.loadForEdit();
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  toggleLabel(labelId: string): void {
    const current = this.selectedLabels();
    this.selectedLabels.set(
      current.includes(labelId)
        ? current.filter(id => id !== labelId)
        : [...current, labelId]
    );
  }

  loadForEdit(): void {
    if (this.cardId) {
      const c = this.workService.getCard(this.cardId);
      if (!c) return;
      this.title.set(c.title);
      this.description.set(c.description);
      this.selectedBoard.set(c.boardId);
      this.selectedColumn.set(c.columnId);
      this.selectedType.set(c.type);
      this.selectedPriority.set(c.priority);
      this.selectedAssignee.set(c.assigneeId);
      this.dueDate.set(c.dueDate);
      this.estimateMinutes.set(c.estimateMinutes);
      this.selectedLabels.set(c.labelIds);
      this.selectedAttachments.set(c.attachments);
    } else {
      // default to first board
      this.selectedBoard.set(this.workService.boards()[0]?.id ?? '');
      this.selectedColumn.set('todo');
      this.selectedType.set('task');
      this.selectedPriority.set('medium');
      this.selectedAssignee.set(null);
      this.dueDate.set(null);
      this.estimateMinutes.set(null);
      this.selectedLabels.set([]);
      this.title.set('');
      this.description.set('');
    }
  }

  save(): void {
    const boardId = this.selectedBoard();
    const columnId = this.selectedColumn();
    const title = this.title().trim();
    const description = this.description();
    const type = this.selectedType();
    const priority = this.selectedPriority();

    if (!title || !boardId || !columnId) return;

    if (this.cardId) {
      const card = this.workService.getCard(this.cardId);
      if (!card) return;
      if (card.boardId !== boardId) {
        this.workService.moveCardToBoard(card.id, boardId, columnId);
      } else if (card.columnId !== columnId) {
        this.workService.moveCard(card.id, columnId);
      }
      this.workService.updateCard(card.id, {
        title,
        description,
        type,
        priority,
        assigneeId: this.selectedAssignee(),
        dueDate: this.dueDate(),
        estimateMinutes: this.estimateMinutes(),
        labelIds: this.selectedLabels(),
        attachments: this.selectedAttachments(),
      });
    } else {
      const card = this.workService.createCard(boardId, columnId, title);
      this.workService.updateCard(card.id, {
        description,
        type,
        priority,
        assigneeId: this.selectedAssignee(),
        dueDate: this.dueDate(),
        estimateMinutes: this.estimateMinutes(),
        labelIds: this.selectedLabels(),
        attachments: this.selectedAttachments(),
      });
    }

    this.close();
  }

  onDialogVisibleChange(v: boolean): void {
    this._visible = v;
    this.visibleChange.emit(v);
    if (v) this.loadForEdit();
  }
}

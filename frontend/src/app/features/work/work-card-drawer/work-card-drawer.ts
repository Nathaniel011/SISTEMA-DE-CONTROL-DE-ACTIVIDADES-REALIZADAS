import {Component, computed, effect, inject, input, model, OnDestroy, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Drawer} from 'primeng/drawer';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Textarea} from 'primeng/textarea';
import {Select} from 'primeng/select';
import {DatePicker} from 'primeng/datepicker';
import {InputNumber} from 'primeng/inputnumber';
import {Avatar} from 'primeng/avatar';
import {Tabs, Tab, TabList, TabPanel, TabPanels} from 'primeng/tabs';
import {FileUpload} from 'primeng/fileupload';
import {Image} from 'primeng/image';
import {WorkService} from '../../../core/services/work.service';
import {WorkApiService} from '../../../core/services/work-api.service';
import {firstValueFrom} from 'rxjs';
import {WORK_PRIORITIES, WorkCard, WorkAttachment} from '../work.models';
import {formatWorkDate, formatWorkMinutes, formatWorkSeconds, priorityMeta} from '../work.utils';

@Component({
  selector: 'app-work-card-drawer',
  imports: [
    FormsModule,
    Drawer,
    Button,
    InputText,
    Textarea,
    Select,
    DatePicker,
    InputNumber,
    Avatar,
    Tabs,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    FileUpload,
    Image,
  ],
  templateUrl: './work-card-drawer.html',
})
export class WorkCardDrawer implements OnDestroy {
  workService = inject(WorkService);
  workApi = inject(WorkApiService);

  elapsedSeconds = signal(0);
  private tick?: ReturnType<typeof setInterval>;

  cardId = input<string | null>(null);
  visible = model(false);

  activeTab = signal<string | number>('0');
  commentText = signal('');
  timeMinutes = signal(30);
  timeNote = signal('');
  uploading = signal(false);

  titleDraft = signal('');
  descriptionDraft = signal('');

  card = computed(() => {
    const id = this.cardId();
    return id ? this.workService.getCard(id) : undefined;
  });

  memberOptions = computed(() =>
    this.workService.members().map(m => ({ label: m.name, value: m.id }))
  );

  priorityOptions = WORK_PRIORITIES.map(p => ({ label: p.label, value: p.value }));

  constructor() {
    effect(() => {
      const c = this.card();
      if (c) {
        this.titleDraft.set(c.title);
        this.descriptionDraft.set(c.description);
      }
    });
    this.tick = setInterval(() => {
      const timer = this.workService.activeTimer();
      if (timer && timer.cardId === this.cardId()) {
        this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
  }

  isTimerRunningHere(): boolean {
    const timer = this.workService.activeTimer();
    return !!timer && timer.cardId === this.cardId();
  }

  startTimer(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.startTimer(id, this.timeNote());
    this.elapsedSeconds.set(0);
  }

  stopTimer(): void {
    this.workService.stopTimer();
    this.elapsedSeconds.set(0);
  }

  saveTitle(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.updateCard(id, { title: this.titleDraft().trim() });
  }

  saveDescription(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.updateCard(id, { description: this.descriptionDraft().trim() });
  }

  updateField(patch: Partial<WorkCard>): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.updateCard(id, patch);
  }

  onDueDateChange(value: Date | null): void {
    const iso = value ? value.toISOString().slice(0, 10) : null;
    this.updateField({ dueDate: iso });
  }

  dueDateValue(): Date | null {
    const due = this.card()?.dueDate;
    return due ? new Date(due) : null;
  }

  toggleLabel(labelId: string): void {
    const c = this.card();
    if (!c) return;
    const labelIds = c.labelIds.includes(labelId)
      ? c.labelIds.filter(id => id !== labelId)
      : [...c.labelIds, labelId];
    this.updateField({ labelIds });
  }

  addComment(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.addComment(id, this.commentText());
    this.commentText.set('');
  }

  logTime(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.logTime(id, this.timeMinutes(), this.timeNote());
    this.timeNote.set('');
    this.timeMinutes.set(30);
  }

  deleteCard(): void {
    const id = this.cardId();
    if (!id) return;
    this.workService.deleteCard(id);
    this.visible.set(false);
  }

  onTabChange(value: string | number | undefined): void {
    this.activeTab.set(value ?? '0');
  }

  async onFileUpload(event: any): Promise<void> {
    const id = this.cardId();
    if (!id || event.files.length === 0) return;

    this.uploading.set(true);
    try {
      for (const file of event.files) {
        await firstValueFrom(this.workApi.uploadFile(file, id));
      }
      // Reload card to get updated attachments
      await this.workService.loadFromApi();
    } finally {
      this.uploading.set(false);
    }
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await firstValueFrom(this.workApi.deleteFile(attachmentId));
    await this.workService.loadFromApi();
  }

  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  formatSeconds = formatWorkSeconds;
  priorityMeta = priorityMeta;
}

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
import {WorkService} from '../../../core/services/work.service';
import {WORK_PRIORITIES, WorkCard} from '../work.models';
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
  ],
  templateUrl: './work-card-drawer.html',
})
export class WorkCardDrawer implements OnDestroy {
  workService = inject(WorkService);

  elapsedSeconds = signal(0);
  private tick?: ReturnType<typeof setInterval>;

  cardId = input<string | null>(null);
  visible = model(false);

  activeTab = signal<string | number>('0');
  commentText = signal('');
  timeMinutes = signal(30);
  timeNote = signal('');

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

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  formatSeconds = formatWorkSeconds;
  priorityMeta = priorityMeta;
}

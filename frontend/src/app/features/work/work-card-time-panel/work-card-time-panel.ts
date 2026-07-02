import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {InputNumber} from 'primeng/inputnumber';
import {WorkService} from '../../../core/services/work.service';
import {WorkCardDetailStore} from '../../../core/services/work-card-detail.store';
import {formatWorkDate, formatWorkMinutes, formatWorkSeconds} from '../work.utils';

@Component({
  selector: 'app-work-card-time-panel',
  imports: [FormsModule, Button, InputText, InputNumber],
  templateUrl: './work-card-time-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkCardTimePanel implements OnDestroy {
  private workService = inject(WorkService);
  private detailStore = inject(WorkCardDetailStore);

  cardId = input.required<string>();
  expanded = input(false);

  timeMinutes = signal(30);
  timeNote = signal('');
  elapsedSeconds = signal(0);
  loggingTime = signal(false);
  startingTimer = signal(false);
  stoppingTimer = signal(false);

  private tick?: ReturnType<typeof setInterval>;

  detail = computed(() => this.detailStore.snapshot(this.cardId()));
  timeEntries = computed(() =>
    [...this.detail().timeEntries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
  );

  timerRunningHere = computed(() => {
    const timer = this.workService.activeTimer();
    return !!timer && timer.cardId === this.cardId();
  });

  trackedMinutes = computed(() => this.workService.getCard(this.cardId())?.trackedMinutes ?? 0);

  constructor() {
    effect(() => {
      const running = this.expanded() && this.timerRunningHere();
      if (running) {
        this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
        if (!this.tick) {
          this.tick = setInterval(() => {
            this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
          }, 1000);
        }
      } else if (this.tick) {
        clearInterval(this.tick);
        this.tick = undefined;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
  }

  async startTimer(): Promise<void> {
    const id = this.cardId();
    if (!id || this.startingTimer()) return;
    this.startingTimer.set(true);
    try {
      await this.workService.startTimer(id, this.timeNote());
      this.elapsedSeconds.set(0);
    } finally {
      this.startingTimer.set(false);
    }
  }

  async stopTimer(): Promise<void> {
    if (this.stoppingTimer()) return;
    this.stoppingTimer.set(true);
    try {
      const entry = await this.workService.stopTimer();
      if (entry) {
        this.detailStore.addTimeEntry(this.cardId(), entry);
      }
      this.elapsedSeconds.set(0);
    } finally {
      this.stoppingTimer.set(false);
    }
  }

  async logTime(): Promise<void> {
    const id = this.cardId();
    if (!id || this.loggingTime()) return;
    this.loggingTime.set(true);
    try {
      const entry = await this.workService.logTime(id, this.timeMinutes(), this.timeNote());
      if (entry) {
        this.detailStore.addTimeEntry(id, entry);
      }
      this.timeNote.set('');
      this.timeMinutes.set(30);
    } finally {
      this.loggingTime.set(false);
    }
  }

  getMemberName(memberId: string): string {
    return this.workService.getMember(memberId)?.name ?? 'Usuario';
  }

  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  formatSeconds = formatWorkSeconds;
}

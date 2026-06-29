import {Component, inject, OnDestroy, signal} from '@angular/core';
import {Button} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {Select} from 'primeng/select';
import {FormsModule} from '@angular/forms';
import {WorkService} from '../../../core/services/work.service';
import {formatWorkDate, formatWorkMinutes, formatWorkSeconds} from '../work.utils';

@Component({
  selector: 'app-work-timesheets',
  imports: [Button, TableModule, Select, FormsModule],
  templateUrl: './work-timesheets.html',
})
export class WorkTimesheets implements OnDestroy {
  workService = inject(WorkService);

  elapsedSeconds = signal(0);
  private tick?: ReturnType<typeof setInterval>;

  constructor() {
    this.tick = setInterval(() => {
      if (this.workService.activeTimer()) {
        this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
  }

  issueOptions() {
    return this.workService.cards().map(c => ({
      label: `${this.workService.getIssueKey(c)} — ${c.title}`,
      value: c.id,
    }));
  }

  selectedIssueId = signal(this.workService.cards()[0]?.id ?? '');

  entries = () => this.workService.getAllTimeEntries();
  formatMinutes = formatWorkMinutes;
  formatDate = formatWorkDate;
  formatSeconds = formatWorkSeconds;

  activeCard() {
    const timer = this.workService.activeTimer();
    return timer ? this.workService.getCard(timer.cardId) : undefined;
  }

  startTimer(): void {
    const id = this.selectedIssueId();
    if (!id) return;
    this.workService.startTimer(id);
    this.elapsedSeconds.set(0);
  }

  stopTimer(): void {
    this.workService.stopTimer();
    this.elapsedSeconds.set(0);
  }
}

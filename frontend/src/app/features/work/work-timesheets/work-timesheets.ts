import {ChangeDetectionStrategy, Component, effect, inject, OnInit, signal} from '@angular/core';
import {Button} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {Select} from 'primeng/select';
import {FormsModule} from '@angular/forms';
import {firstValueFrom} from 'rxjs';
import {WorkService} from '../../../core/services/work.service';
import {TimeEntryWithIssue, WorkApiService} from '../../../core/services/work-api.service';
import {formatWorkDate, formatWorkMinutes, formatWorkSeconds} from '../work.utils';

@Component({
  selector: 'app-work-timesheets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, TableModule, Select, FormsModule],
  templateUrl: './work-timesheets.html',
})
export class WorkTimesheets implements OnInit {
  workService = inject(WorkService);
  private workApi = inject(WorkApiService);

  elapsedSeconds = signal(0);
  entries = signal<{ entry: TimeEntryWithIssue; cardLabel: string }[]>([]);
  loadingEntries = signal(false);

  constructor() {
    effect(onCleanup => {
      if (!this.workService.activeTimer()) {
        return;
      }
      this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
      const tick = setInterval(() => {
        if (this.workService.activeTimer()) {
          this.elapsedSeconds.set(this.workService.timerElapsedSeconds());
        }
      }, 1000);
      onCleanup(() => clearInterval(tick));
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadEntries();
  }

  async loadEntries(): Promise<void> {
    this.loadingEntries.set(true);
    try {
      const rows = await firstValueFrom(this.workApi.listTimeEntries());
      this.entries.set(
        rows.map(entry => {
          const card = this.workService.getCard(entry.issueId);
          return {
            entry,
            cardLabel: card ? `${this.workService.getIssueKey(card)} — ${card.title}` : entry.issueId,
          };
        })
      );
    } finally {
      this.loadingEntries.set(false);
    }
  }

  issueOptions() {
    return this.workService.cards().map(c => ({
      label: `${this.workService.getIssueKey(c)} — ${c.title}`,
      value: c.id,
    }));
  }

  selectedIssueId = signal(this.workService.cards()[0]?.id ?? '');

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
    void this.workService.startTimer(id).then(() => this.elapsedSeconds.set(0));
  }

  stopTimer(): void {
    void this.workService.stopTimer().then(() => {
      this.elapsedSeconds.set(0);
      void this.loadEntries();
    });
  }
}

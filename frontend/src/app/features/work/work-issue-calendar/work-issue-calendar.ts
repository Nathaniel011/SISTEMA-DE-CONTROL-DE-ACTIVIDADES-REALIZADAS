import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {WorkService} from '../../../core/services/work.service';
import {WorkCard} from '../work.models';
import {formatWorkDateISO} from '../work.utils';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABEL = new Intl.DateTimeFormat('es-BO', {month: 'long', year: 'numeric'});
const DAY_LABEL = new Intl.DateTimeFormat('es-BO', {weekday: 'long', day: 'numeric', month: 'long'});

@Component({
  selector: 'app-work-issue-calendar',
  imports: [RouterLink, Button],
  templateUrl: './work-issue-calendar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkIssueCalendar {
  readonly cards = input.required<WorkCard[]>();
  readonly month = input.required<string>();
  readonly monthChange = output<string>();
  private readonly work = inject(WorkService);
  protected readonly days = DAYS;
  protected readonly reference = (card: WorkCard) => this.work.getIssueKey(card);

  private readonly origin = computed(() => new Date(`${this.month()}-01T12:00:00`));
  protected readonly title = computed(() => MONTH_LABEL.format(this.origin()));
  protected readonly dates = computed(() => {
    const month = this.origin();
    const first = (month.getDay() + 6) % 7;
    const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const groups = new Map<string, WorkCard[]>();
    for (const card of this.cards()) {
      if (!card.dueDate) continue;
      const list = groups.get(card.dueDate) ?? [];
      list.push(card);
      groups.set(card.dueDate, list);
    }
    const today = formatWorkDateISO(new Date());
    return Array.from({length: Math.ceil((first + length) / 7) * 7}, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index - first + 1, 12);
      const iso = formatWorkDateISO(date);
      return {iso, day: date.getDate(), label: DAY_LABEL.format(date), today: iso === today,
        inside: date.getMonth() === month.getMonth(), cards: groups.get(iso) ?? []};
    });
  });
  protected readonly scheduled = computed(() => this.dates().filter(day => day.inside && day.cards.length));
  protected readonly unscheduled = computed(() => this.cards().filter(card => !card.dueDate));

  protected jump(delta: number): void {
    const current = this.origin();
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1, 12);
    this.monthChange.emit(formatWorkDateISO(next).slice(0, 7));
  }

  protected goToday(): void {
    this.monthChange.emit(formatWorkDateISO(new Date()).slice(0, 7));
  }
}

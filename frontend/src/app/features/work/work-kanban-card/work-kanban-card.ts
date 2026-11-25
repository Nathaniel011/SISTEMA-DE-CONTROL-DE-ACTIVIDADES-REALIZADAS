import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {Params, RouterLink} from '@angular/router';
import {Avatar} from 'primeng/avatar';
import {WorkCard, WorkMember} from '../work.models';
import {formatWorkDate, formatWorkMinutes, getTimeOverrunColor, getTimeOverrunStatus, isDueSoon, isOverdue, priorityMeta} from '../work.utils';

@Component({
  selector: 'article[appWorkKanbanCard]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Avatar],
  host: {class: 'work-kanban-card'},
  templateUrl: './work-kanban-card.html',
  styleUrl: './work-kanban-card.css',
})
export class WorkKanbanCard {
  readonly card = input.required<WorkCard>();
  readonly issueKey = input.required<string>();
  readonly member = input<WorkMember>();
  readonly projectName = input('');
  readonly navigationParams = input<Params>({});

  protected readonly priority = computed(() => priorityMeta(this.card().priority));
  protected readonly showsPriority = computed(() => ['high', 'critical'].includes(this.card().priority));
  protected readonly isOpen = computed(() => !['done', 'closed'].includes(this.card().columnId));
  protected readonly overdue = computed(() => this.isOpen() && isOverdue(this.card().dueDate));
  protected readonly dueSoon = computed(() => this.isOpen() && isDueSoon(this.card().dueDate));
  protected readonly timeTone = computed(() => getTimeOverrunColor(getTimeOverrunStatus(this.card())));
  protected readonly formatDate = formatWorkDate;
  protected readonly formatMinutes = formatWorkMinutes;
}

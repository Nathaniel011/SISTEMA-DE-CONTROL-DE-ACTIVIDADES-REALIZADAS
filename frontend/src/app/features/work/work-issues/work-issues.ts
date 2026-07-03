import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Avatar} from 'primeng/avatar';
import {WorkService, WorkIssueFilter} from '../../../core/services/work.service';
import {WORK_SAVED_SEARCHES} from '../work-nav';
import {priorityMeta} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';

@Component({
  selector: 'app-work-issues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    TableModule,
    IconField,
    InputIcon,
    InputText,
    Select,
    Avatar,
    WorkCardDrawer,
  ],
  templateUrl: './work-issues.html',
})
export class WorkIssues {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  workService = inject(WorkService);

  private queryParams = toSignal(this.route.queryParamMap);

  searchQuery = signal('');
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);

  savedSearches = WORK_SAVED_SEARCHES;

  constructor() {
    effect(() => {
      const params = this.queryParams();
      if (!params) return;

      const issueId = params.get('issue');
      if (issueId) {
        this.openIssue(issueId);
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });

    void this.workService.ensureAllCards();
  }

  boardOptions(): { label: string; value: string }[] {
    return [
      { label: 'Todos los tableros', value: 'all' },
      ...this.workService.boards().map(b => ({ label: b.name, value: b.id })),
    ];
  }

  issues() {
    return this.workService.getFilteredIssues(this.searchQuery());
  }

  selectSearch(filter: WorkIssueFilter): void {
    void this.workService.saveActiveSearch(filter);
  }

  openIssue(cardId: string): void {
    this.selectedCardId.set(cardId);
    this.drawerOpen.set(true);
  }

  searchCount(filter: WorkIssueFilter): number {
    return this.workService.countForSearch(filter);
  }

  priorityMeta = priorityMeta;
}

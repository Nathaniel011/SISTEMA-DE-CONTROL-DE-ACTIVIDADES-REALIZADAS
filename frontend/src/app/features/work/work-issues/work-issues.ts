import {Component, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Avatar} from 'primeng/avatar';
import {Dialog} from 'primeng/dialog';
import {WorkService, WorkIssueFilter} from '../../../core/services/work.service';
import {WORK_ISSUE_TYPES, WorkIssueType} from '../work.models';
import {WORK_SAVED_SEARCHES} from '../work-nav';
import {priorityMeta} from '../work.utils';
import {WorkCardDrawer} from '../work-card-drawer/work-card-drawer';

@Component({
  selector: 'app-work-issues',
  imports: [
    FormsModule,
    Button,
    TableModule,
    IconField,
    InputIcon,
    InputText,
    Select,
    Avatar,
    Dialog,
    WorkCardDrawer,
  ],
  templateUrl: './work-issues.html',
})
export class WorkIssues implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  workService = inject(WorkService);

  searchQuery = signal('');
  selectedCardId = signal<string | null>(null);
  drawerOpen = signal(false);
  createDialogOpen = signal(false);
  newIssueTitle = signal('');
  newIssueType = signal<WorkIssueType>('task');

  savedSearches = WORK_SAVED_SEARCHES;
  issueTypes = WORK_ISSUE_TYPES;

  projectOptions(): { label: string; value: string }[] {
    return [
      { label: 'Todos los proyectos', value: 'all' },
      ...this.workService.boards().map(b => ({ label: b.name, value: b.id })),
    ];
  }

  projectOptionsForCreate(): { label: string; value: string }[] {
    return this.workService.boards().map(b => ({ label: b.name, value: b.id }));
  }

  issues() {
    return this.workService.getFilteredIssues(this.searchQuery());
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      if (params.get('new') === '1') {
        this.createDialogOpen.set(true);
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
      const issueId = params.get('issue');
      if (issueId) {
        this.openIssue(issueId);
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });
  }

  selectSearch(filter: WorkIssueFilter): void {
    this.workService.activeSavedSearch.set(filter);
  }

  openIssue(cardId: string): void {
    this.selectedCardId.set(cardId);
    this.drawerOpen.set(true);
  }

  createIssue(): void {
    const title = this.newIssueTitle().trim();
    if (!title) return;
    let projectId = this.workService.selectedProjectId();
    if (projectId === 'all') {
      projectId = this.workService.boards()[0]?.id ?? 'all';
    }
    if (projectId === 'all') return;
    const card = this.workService.createIssue(projectId, title, this.newIssueType());
    this.createDialogOpen.set(false);
    this.newIssueTitle.set('');
    this.openIssue(card.id);
  }

  issueTypeMeta(type: WorkIssueType) {
    return WORK_ISSUE_TYPES.find(t => t.value === type)!;
  }

  searchCount(filter: WorkIssueFilter): number {
    return this.workService.countForSearch(filter);
  }

  priorityMeta = priorityMeta;
}

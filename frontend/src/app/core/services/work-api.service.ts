import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import type {IssueQuery} from '../../features/work/work-issues/work-issue-query';
import {IssueFieldValue, IssueFieldValues, ProjectTransition} from './project-configuration-api.service';
import {
  WorkActiveTimer,
  WorkBoard,
  WorkBoardList,
  WorkCard,
  WorkColumnId,
  WorkComment,
  WorkMember,
  WorkPriority,
  WorkTimeEntry,
  WorkAttachment,
} from '../../features/work/work.models';

export interface WorkBootstrapResponse {
  boards: WorkBoard[];
  boardLists: WorkBoardList[];
  cards: WorkCard[];
  members: WorkMember[];
  activeTimer: WorkActiveTimer | null;
  movableIssueIds?: string[];
  boardListColumns?: Record<string, WorkColumnId>;
  projectTransitions?: Record<string, ProjectTransition[]>;
}

interface ProjectCards {
  cards: WorkCard[];
  movableIssueIds: string[];
}

export type IssuePageRow = Pick<WorkCard, 'id' | 'boardId' | 'boardListId' | 'issueNumber' | 'columnId'
  | 'title' | 'priority' | 'assigneeId' | 'dueDate' | 'updatedAt'> & {canEdit: boolean};

export interface IssuePageResult {
  items: IssuePageRow[];
  counts: Record<'all' | 'assigned' | 'overdue' | 'unassigned', number>;
  total: number;
  page: number;
}

export interface IssuePageQuery {
  page: number;
  size: number;
  text: string;
  terms: IssueQuery['terms'];
  projects: string[] | null;
  member: string | null;
  status: string | null;
  priority: string | null;
  group: string | null;
  activity: string | null;
  scope: string;
  sort: string;
  createdFrom: string | null;
  createdTo: string | null;
  today: string;
}

export interface GanttTask {
  id: string;
  key: string;
  title: string;
  start: string | null;
  end: string | null;
  columnId: WorkColumnId;
  assigneeName: string | null;
  progress: number;
  parentId?: string | null;
  estimateMinutes?: number | null;
  priority?: WorkPriority;
  issueType?: string;
  projectName?: string;
  observations?: string | null;
  hasChildren?: boolean;
  rowType?: 'PROJECT' | 'LIST' | 'TASK';
  projectId?: string;
  boardListId?: string | null;
  assigneeId?: string | null;
  trackedMinutes?: number;
  dueDate?: string | null;
  pinned?: boolean;
  canEdit?: boolean;
}

export interface GanttLink {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface GanttResponse {
  projectStart?: string;
  projectEnd?: string;
  durationLabel?: string;
  hierarchical?: boolean;
  tasks: GanttTask[];
  links: GanttLink[];
}

export interface WeeklyPlanRow {
  index: number;
  issueKey: string;
  projectName: string;
  title: string;
  members: string;
  startDay: string;
  endDay: string;
  priority: string;
  issueType: string;
  observations: string;
}

export interface WeeklyPlanResponse {
  weekStart: string;
  weekEnd: string;
  groupedByProject: boolean;
  groups: WeeklyPlanGroup[];
}

export interface WeeklyPlanGroup {
  projectName: string;
  rows: WeeklyPlanRow[];
}

export interface KnowledgeArticle {
  id: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  authorName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  projectRemoved: boolean;
}

export interface KnowledgeArticlePayload {
  projectId?: string | null;
  title?: string;
  content?: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'archived';
  clearProject?: boolean;
  expectedUpdatedAt?: string;
}

export interface WhiteboardDto {
  id: string;
  projectId: string | null;
  projectName: string | null;
  projectRemoved?: boolean;
  name: string;
  description: string;
  contentJson: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardPayload {
  projectId?: string | null;
  name?: string;
  description?: string;
  contentJson?: string;
}

export interface FileUploadResponse {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt?: string;
}

export interface TimeEntryWithIssue {
  id: string;
  issueId: string;
  memberId: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  issueNumber: number;
  issueTitle: string;
  issueType: string | null;
  minutes: number;
  activityType: string;
  note: string;
  loggedAt: string;
}

export interface IssueDetailsResponse {
  comments: WorkComment[];
  timeEntries: WorkTimeEntry[];
  attachments: WorkAttachment[];
  activity?: WorkActivity[];
  customFields?: IssueFieldValue[];
  canEdit?: boolean;
}

export interface WorkActivity {
  id: string;
  actor: string;
  action: string;
  before: string | null;
  after: string | null;
  createdAt: string;
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  columnId?: WorkColumnId;
  boardListId?: string | null;
  priority?: WorkPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  receptionChannel?: string;
  startDate?: string;
  endDate?: string;
  issueType?: string;
  observations?: string | null;
  customFields?: IssueFieldValues;
}

export interface DashboardResponse {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  unassigned: number;
  critical: number;
  trackedMinutes: number;
  byStatus: { label: string; count: number }[];
  byPriority: { label: string; count: number }[];
}

export interface UserPreferencesResponse {
  activeIssueFilter: string;
}

@Injectable({ providedIn: 'root' })
export class WorkApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  bootstrap(options?: { cards?: 'all' | 'none' | 'board'; boardId?: string }): Observable<WorkBootstrapResponse> {
    const params: Record<string, string> = {};
    if (options?.cards) {
      params['cards'] = options.cards;
    }
    if (options?.boardId) {
      params['boardId'] = options.boardId;
    }
    return this.http.get<WorkBootstrapResponse>(`${this.base}/api/work/bootstrap`, { params });
  }

  getProjectCards(projectId: string): Observable<ProjectCards> {
    return this.http.get<ProjectCards>(`${this.base}/api/projects/${projectId}/cards`, {params: {includePermissions: true}});
  }

  getDashboard(options?: { projectId?: string; startDate?: string; endDate?: string }): Observable<DashboardResponse> {
    const params: Record<string, string> = {};
    if (options?.projectId) params['projectId'] = options.projectId;
    if (options?.startDate) params['startDate'] = options.startDate;
    if (options?.endDate) params['endDate'] = options.endDate;
    return this.http.get<DashboardResponse>(`${this.base}/api/dashboards`, { params });
  }

  getUserPreferences(): Observable<UserPreferencesResponse> {
    return this.http.get<UserPreferencesResponse>(`${this.base}/api/users/me/preferences`);
  }

  updateUserPreferences(activeIssueFilter: string): Observable<UserPreferencesResponse> {
    return this.http.put<UserPreferencesResponse>(`${this.base}/api/users/me/preferences`, {
      activeIssueFilter,
    });
  }

  getIssue(reference: string): Observable<WorkCard> {
    return this.http.get<WorkCard>(`${this.base}/api/issues/${encodeURIComponent(reference)}`);
  }

  searchIssues(query: IssuePageQuery): Observable<IssuePageResult> {
    return this.http.post<IssuePageResult>(`${this.base}/api/work/issues/search`, query);
  }

  boardCounts(): Observable<Record<string, {total: number; inProgress: number}>> {
    return this.http.get<Record<string, {total: number; inProgress: number}>>(`${this.base}/api/work/issues/board-counts`);
  }

  getIssueDetails(issueId: string): Observable<IssueDetailsResponse> {
    return this.http.get<IssueDetailsResponse>(`${this.base}/api/issues/${issueId}/details`);
  }

  createIssue(payload: {
    boardId: string;
    title: string;
    description?: string;
    columnId?: WorkColumnId;
    boardListId?: string;
    parentIssueId?: string;
    assigneeId?: string;
    requesterName?: string;
    requesterPhone?: string;
    requesterEmail?: string;
    receptionChannel?: string;
    customFields?: IssueFieldValues;
  }): Observable<WorkCard> {
    return this.http.post<WorkCard>(`${this.base}/api/issues`, payload);
  }

  updateIssue(id: string, payload: UpdateIssuePayload): Observable<WorkCard> {
    return this.http.put<WorkCard>(`${this.base}/api/issues/${id}`, payload);
  }

  moveIssue(
    id: string,
    options: {
      columnId?: WorkColumnId;
      boardListId?: string;
      targetIndex?: number;
      targetBoardId?: string;
      expectedSourceColumn?: WorkColumnId;
    }
  ): Observable<WorkCard> {
    return this.http.patch<WorkCard>(`${this.base}/api/issues/${id}/move`, options);
  }

  deleteIssue(id: string): Observable<void> {
    return this.http
      .delete(`${this.base}/api/issues/${id}`, { responseType: 'text' })
      .pipe(map(() => undefined));
  }

  assignIncomingIssue(id: string, targetBoardId: string, assigneeId: string): Observable<WorkCard> {
    return this.http.post<WorkCard>(`${this.base}/api/issues/${id}/assign-incoming`, {targetBoardId, assigneeId});
  }

  addComment(issueId: string, text: string, publicReply = false): Observable<WorkComment> {
    return this.http.post<WorkComment>(`${this.base}/api/issues/${issueId}/comments`, {text, publicReply});
  }

  getIssueViews(): Observable<{id: string; name: string; filters: Record<string, string>}[]> {
    return this.http.get<{id: string; name: string; filters: Record<string, string>}[]>(`${this.base}/api/users/me/issue-views`);
  }

  saveIssueView(view: {name: string; filters: Record<string, string>}): Observable<{id: string; name: string; filters: Record<string, string>}> {
    return this.http.post<{id: string; name: string; filters: Record<string, string>}>(`${this.base}/api/users/me/issue-views`, view);
  }

  deleteIssueView(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/users/me/issue-views/${id}`);
  }

  logTime(issueId: string, minutes: number, note: string, loggedAt?: string, activityType?: string): Observable<WorkTimeEntry> {
    return this.http.post<WorkTimeEntry>(`${this.base}/api/issues/${issueId}/time`, {
      minutes,
      note,
      loggedAt,
      activityType,
    });
  }

  startTimer(cardId: string, note = ''): Observable<WorkActiveTimer> {
    return this.http.post<WorkActiveTimer>(`${this.base}/api/time/timer/start`, { issueId: cardId, note });
  }

  stopTimer(): Observable<WorkTimeEntry> {
    return this.http.post<WorkTimeEntry>(`${this.base}/api/time/timer/stop`, {});
  }

  listTimeEntries(): Observable<TimeEntryWithIssue[]> {
    return this.http.get<TimeEntryWithIssue[]>(`${this.base}/api/time/entries`);
  }

  gantt(projectId?: string): Observable<GanttResponse> {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.get<GanttResponse>(`${this.base}/api/gantt`, { params });
  }

  updateGanttTaskDates(issueId: string, change: {start: string | null; end: string | null; estimateMinutes: number | null; pinned: boolean}): Observable<GanttTask> {
    return this.http.patch<GanttTask>(`${this.base}/api/gantt/tasks/${issueId}`, {...change, updateEstimate: true});
  }

  addDependency(issueId: string, dependsOnIssueId: string, dependencyType = 'FINISH_TO_START'): Observable<GanttLink> {
    return this.http.post<GanttLink>(`${this.base}/api/issues/${issueId}/dependencies`, {
      dependsOnIssueId,
      dependencyType,
    });
  }

  removeDependency(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/dependencies/${id}`);
  }

  recalculateGantt(projectId: string): Observable<GanttResponse> {
    return this.http.post<GanttResponse>(`${this.base}/api/gantt/recalculate`, null, {
      params: { projectId },
    });
  }

  getWeeklyPlan(projectId?: string, weekStart?: string): Observable<WeeklyPlanResponse> {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    if (weekStart) params['weekStart'] = weekStart;
    return this.http.get<WeeklyPlanResponse>(`${this.base}/api/reports/weekly-plan`, { params });
  }

  exportWeeklyPlan(projectId?: string, weekStart?: string): Observable<Blob> {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    if (weekStart) params['weekStart'] = weekStart;
    return this.http.get(`${this.base}/api/reports/weekly-plan/export`, {
      params,
      responseType: 'blob',
    });
  }

  getReports(projectId?: string, startDate?: string, endDate?: string): Observable<any> {
    const params: any = {};
    if (projectId) params.projectId = projectId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return this.http.get<any>(`${this.base}/api/reports`, { params });
  }

  listKnowledgeArticles(projectId?: string | null, q?: string): Observable<KnowledgeArticle[]> {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    if (q?.trim()) params['q'] = q.trim();
    return this.http.get<KnowledgeArticle[]>(`${this.base}/api/knowledge/articles`, { params });
  }

  createKnowledgeArticle(payload: KnowledgeArticlePayload): Observable<KnowledgeArticle> {
    return this.http.post<KnowledgeArticle>(`${this.base}/api/knowledge/articles`, payload);
  }

  getKnowledgeArticle(id: string): Observable<KnowledgeArticle> {
    return this.http.get<KnowledgeArticle>(`${this.base}/api/knowledge/articles/${encodeURIComponent(id)}`);
  }

  updateKnowledgeArticle(id: string, payload: KnowledgeArticlePayload): Observable<KnowledgeArticle> {
    return this.http.put<KnowledgeArticle>(`${this.base}/api/knowledge/articles/${id}`, payload);
  }

  deleteKnowledgeArticle(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/knowledge/articles/${id}`);
  }

  listWhiteboards(projectId?: string | null): Observable<WhiteboardDto[]> {
    const params: Record<string, string> = {};
    if (projectId) params['projectId'] = projectId;
    return this.http.get<WhiteboardDto[]>(`${this.base}/api/whiteboards`, { params });
  }

  createWhiteboard(payload: WhiteboardPayload): Observable<WhiteboardDto> {
    return this.http.post<WhiteboardDto>(`${this.base}/api/whiteboards`, payload);
  }

  updateWhiteboard(id: string, payload: WhiteboardPayload): Observable<WhiteboardDto> {
    return this.http.put<WhiteboardDto>(`${this.base}/api/whiteboards/${id}`, payload);
  }

  deleteWhiteboard(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/whiteboards/${id}`);
  }

  whiteboardEventsUrl(id: string): string {
    return `${this.base}/api/whiteboards/${encodeURIComponent(id)}/events`;
  }

  uploadFile(file: File, issueId: string): Observable<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('issueId', issueId);
    return this.http.post<FileUploadResponse>(`${this.base}/api/files/upload`, formData);
  }

  deleteFile(fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/files/${fileId}`);
  }

  createBoard(payload: { name: string; description?: string; type?: string; parentBoardId?: string | null }): Observable<WorkBoard> {
    return this.http.post<WorkBoard>(`${this.base}/api/projects`, payload);
  }

  deleteBoard(boardId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/projects/${boardId}`);
  }

  getBoardLists(boardId: string): Observable<WorkBoardList[]> {
    return this.http.get<WorkBoardList[]>(`${this.base}/api/projects/${boardId}/lists`);
  }

  createBoardList(boardId: string, payload: { name: string; sortOrder: number }): Observable<WorkBoardList> {
    return this.http.post<WorkBoardList>(`${this.base}/api/projects/${boardId}/lists`, payload);
  }

  updateBoardList(
    boardId: string,
    listId: string,
    payload: { name: string; sortOrder: number; archived?: boolean }
  ): Observable<WorkBoardList> {
    return this.http.put<WorkBoardList>(`${this.base}/api/projects/${boardId}/lists/${listId}`, payload);
  }

  deleteBoardList(boardId: string, listId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/projects/${boardId}/lists/${listId}`);
  }

  updateBoardMembers(boardId: string, actions: { userId: string; action: string }[]): Observable<WorkBoard> {
    return this.http.patch<WorkBoard>(`${this.base}/api/projects/${boardId}/members`, { actions });
  }
}

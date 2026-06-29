import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {
  WorkActiveTimer,
  WorkBoard,
  WorkCard,
  WorkColumnId,
  WorkComment,
  WorkIssueType,
  WorkLabel,
  WorkMember,
  WorkPriority,
  WorkTimeEntry,
} from '../../features/work/work.models';

export interface WorkBootstrapResponse {
  boards: WorkBoard[];
  cards: WorkCard[];
  labels: WorkLabel[];
  members: WorkMember[];
  activeTimer: WorkActiveTimer | null;
}

export interface GanttTask {
  id: string;
  key: string;
  title: string;
  start: string;
  end: string;
  columnId: WorkColumnId;
  assigneeName: string;
  progress: number;
}

export interface GanttLink {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface GanttResponse {
  tasks: GanttTask[];
  links: GanttLink[];
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  type?: WorkIssueType;
  columnId?: WorkColumnId;
  priority?: WorkPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  labelIds?: string[];
}

@Injectable({ providedIn: 'root' })
export class WorkApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  bootstrap(): Observable<WorkBootstrapResponse> {
    return this.http.get<WorkBootstrapResponse>(`${this.base}/api/work/bootstrap`);
  }

  createIssue(payload: {
    boardId: string;
    title: string;
    type?: WorkIssueType;
    columnId?: WorkColumnId;
  }): Observable<WorkCard> {
    return this.http.post<WorkCard>(`${this.base}/api/issues`, payload);
  }

  updateIssue(id: string, payload: UpdateIssuePayload): Observable<WorkCard> {
    return this.http.put<WorkCard>(`${this.base}/api/issues/${id}`, payload);
  }

  moveIssue(id: string, columnId: WorkColumnId, targetIndex?: number): Observable<WorkCard> {
    return this.http.patch<WorkCard>(`${this.base}/api/issues/${id}/move`, { columnId, targetIndex });
  }

  deleteIssue(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/issues/${id}`);
  }

  addComment(issueId: string, text: string): Observable<WorkComment> {
    return this.http.post<WorkComment>(`${this.base}/api/issues/${issueId}/comments`, { text });
  }

  logTime(issueId: string, minutes: number, note: string): Observable<WorkTimeEntry> {
    return this.http.post<WorkTimeEntry>(`${this.base}/api/issues/${issueId}/time`, { minutes, note });
  }

  startTimer(cardId: string, note = ''): Observable<WorkActiveTimer> {
    return this.http.post<WorkActiveTimer>(`${this.base}/api/time/timer/start`, { issueId: cardId, note });
  }

  stopTimer(): Observable<WorkTimeEntry> {
    return this.http.post<WorkTimeEntry>(`${this.base}/api/time/timer/stop`, {});
  }

  gantt(projectId: string): Observable<GanttResponse> {
    return this.http.get<GanttResponse>(`${this.base}/api/gantt`, { params: { projectId } });
  }

  addDependency(issueId: string, dependsOnIssueId: string, dependencyType = 'finish_to_start'): Observable<GanttLink> {
    return this.http.post<GanttLink>(`${this.base}/api/issues/${issueId}/dependencies`, {
      dependsOnIssueId,
      dependencyType,
    });
  }

  removeDependency(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/dependencies/${id}`);
  }
}

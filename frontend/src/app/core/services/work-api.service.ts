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
}

export interface KnowledgeArticlePayload {
  projectId?: string | null;
  title?: string;
  content?: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'archived';
}

export interface WhiteboardDto {
  id: string;
  projectId: string | null;
  projectName: string | null;
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
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  receptionChannel?: string;
  startDate?: string;
  endDate?: string;
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

  moveIssue(id: string, columnId: WorkColumnId, targetIndex?: number, targetBoardId?: string): Observable<WorkCard> {
    const payload: any = { columnId };
    if (targetIndex !== undefined && targetIndex !== null) payload.targetIndex = targetIndex;
    if (targetBoardId) payload.targetBoardId = targetBoardId;
    return this.http.patch<WorkCard>(`${this.base}/api/issues/${id}/move`, payload);
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

  updateGanttTaskDates(issueId: string, start: string, end: string): Observable<GanttTask> {
    return this.http.patch<GanttTask>(`${this.base}/api/gantt/tasks/${issueId}`, { start, end });
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

  whiteboardEventsUrl(id: string, token: string): string {
    return `${this.base}/api/whiteboards/${id}/events?access_token=${encodeURIComponent(token)}`;
  }

  uploadFile(file: File, issueId: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('issueId', issueId);
    return this.http.post<any>(`${this.base}/api/files/upload`, formData);
  }

  deleteFile(fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/files/${fileId}`);
  }

  createProject(payload: { name: string; description?: string }): Observable<any> {
    return this.http.post<any>(`${this.base}/api/projects`, payload);
  }

  updateProjectMembers(projectId: string, actions: { userId: string; action: string }[]): Observable<any> {
    return this.http.patch<any>(`${this.base}/api/projects/${projectId}/members`, { actions });
  }
}

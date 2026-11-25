import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {GanttResponse} from './work-api.service';

export interface GanttPlanDraft {
  name: string;
  projectIds: string[];
  startDate: string;
  capacity: number | null;
  assigneeCapacity: number | null;
  workdaysOnly: boolean;
  syncIssueDates: boolean;
  shared: boolean;
}

export interface GanttPlan extends GanttPlanDraft {id: string; editable: boolean}
export interface GanttCandidate {id: string; key: string; title: string; projectId: string}
export interface GanttTaskChange {start: string | null; end: string | null; estimateMinutes: number | null; pinned: boolean}

@Injectable({providedIn: 'root'})
export class GanttPlanApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/gantt/plans`;

  list() { return this.http.get<GanttPlan[]>(this.base); }

  save(draft: GanttPlanDraft, id?: string) {
    return id ? this.http.put<GanttPlan>(this.planUrl(id), draft) : this.http.post<GanttPlan>(this.base, draft);
  }

  remove(id: string) { return this.http.delete<void>(this.planUrl(id)); }

  chart(id: string) { return this.http.get<GanttResponse>(this.planUrl(id) + '/chart'); }

  candidates(id: string, query: string) {
    return this.http.get<GanttCandidate[]>(this.planUrl(id) + '/candidates', {params: {q: query}});
  }

  select(id: string, issueIds: string[]) {
    return this.http.put<GanttResponse>(this.planUrl(id) + '/items', {issueIds});
  }

  updateTask(id: string, issueId: string, change: GanttTaskChange) {
    return this.http.patch<GanttResponse>(this.planUrl(id) + '/items/' + encodeURIComponent(issueId), change);
  }

  add(id: string, issueId: string) {
    return this.http.post<GanttResponse>(this.planUrl(id) + '/items/' + encodeURIComponent(issueId), null);
  }

  recalculate(id: string) { return this.http.post<GanttResponse>(this.planUrl(id) + '/recalculate', null); }


  private planUrl(id: string): string { return this.base + '/' + encodeURIComponent(id); }
}

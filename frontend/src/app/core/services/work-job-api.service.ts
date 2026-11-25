import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {exhaustMap, filter, timeout, timer} from 'rxjs';
import {environment} from '../../../environments/environment';

export interface WorkJob {id: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; failureStatus: number | null}

@Injectable({providedIn: 'root'})
export class WorkJobApi {
  private readonly http = inject(HttpClient);
  private readonly gantt = `${environment.apiUrl}/api/gantt/jobs`;
  private readonly exports = `${environment.apiUrl}/api/planning/export-jobs`;

  recalculate(kind: 'GANTT_PLAN' | 'GANTT_PROJECT', target: string) {
    return this.http.post<WorkJob>(this.gantt, null, {params: {kind, target}});
  }

  exportWeek(weekStart: string, projectId: string | null) {
    const params: Record<string, string> = {weekStart};
    if (projectId) params['projectId'] = projectId;
    return this.http.post<WorkJob>(this.exports, null, {params});
  }

  wait(job: WorkJob, kind: 'gantt' | 'export') {
    const endpoint = (kind === 'gantt' ? this.gantt : this.exports) + '/' + encodeURIComponent(job.id);
    return timer(0, 1500).pipe(
      exhaustMap(() => this.http.get<WorkJob>(endpoint)),
      filter(status => status.status === 'succeeded' || status.status === 'failed'),
      timeout(200000),
    );
  }

  exportFile(id: string) {
    return this.http.get(this.exports + '/' + encodeURIComponent(id) + '/file', {responseType: 'blob'});
  }
}

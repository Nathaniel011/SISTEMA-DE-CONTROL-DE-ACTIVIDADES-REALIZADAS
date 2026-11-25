import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {WorkColumnId} from '../../features/work/work.models';

export type ProjectFieldKind = 'text' | 'integer' | 'date' | 'booleanValue' | 'enumeration';
export interface ProjectFieldDraft {name: string; kind: ProjectFieldKind; options: string[]}
export interface ProjectField extends ProjectFieldDraft {id: string; archived: boolean}
export interface IssueFieldValue {field: ProjectField; value: string | null}
export type IssueFieldValues = Record<string, string | null>;
export interface ProjectTransition {from: WorkColumnId; to: WorkColumnId}
export interface ProjectConfiguration {
  fields: ProjectField[];
  transitions: ProjectTransition[] | null;
  canManage: boolean;
}

@Injectable({providedIn: 'root'})
export class ProjectConfigurationApi {
  private readonly http = inject(HttpClient);

  get(projectId: string) {
    return this.http.get<ProjectConfiguration>(this.url(projectId));
  }

  addField(projectId: string, draft: ProjectFieldDraft) {
    return this.http.post<ProjectField>(this.url(projectId) + '/fields', draft);
  }

  archiveField(projectId: string, fieldId: string, archived: boolean) {
    return this.http.patch<void>(this.url(projectId) + '/fields/' + fieldId, {archived});
  }

  saveWorkflow(projectId: string, transitions: ProjectTransition[] | null) {
    return this.http.put<void>(this.url(projectId) + '/workflow', {transitions});
  }

  private url(projectId: string): string {
    return `${environment.apiUrl}/api/projects/${encodeURIComponent(projectId)}/configuration`;
  }
}

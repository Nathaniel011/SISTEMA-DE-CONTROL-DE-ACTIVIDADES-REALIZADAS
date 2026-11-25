import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';

export interface AgileBoard {
  id: string;
  name: string;
  projectIds: string[];
}

@Injectable({providedIn: 'root'})
export class AgileBoardApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/users/me/agile-boards`;

  list() {
    return this.http.get<AgileBoard[]>(this.url);
  }

  get(id: string) {
    return this.http.get<AgileBoard>(`${this.url}/${encodeURIComponent(id)}`);
  }

  save(draft: Omit<AgileBoard, 'id'>, id?: string) {
    return id ? this.http.put<AgileBoard>(`${this.url}/${encodeURIComponent(id)}`, draft)
      : this.http.post<AgileBoard>(this.url, draft);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }
}

import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {environment} from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  get<T>(endpoint: string, params?: HttpParams){
    return this.http.get(`${this.baseUrl}/${endpoint}`, {params});
  }

  post<T>(endpoint: string, data: unknown){
    return this.http.post(`${this.baseUrl}/${endpoint}`, data);
  }
}

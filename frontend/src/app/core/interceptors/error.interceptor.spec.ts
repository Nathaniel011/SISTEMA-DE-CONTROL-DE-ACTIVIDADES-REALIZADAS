import {HttpClient, provideHttpClient, withInterceptors} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AuthService} from '../services/auth.service';
import {errorInterceptor} from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  let token: string;
  const logout = vi.fn();

  beforeEach(() => {
    token = 'old-session';
    logout.mockClear();
    TestBed.configureTestingModule({providers: [
      provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting(),
      {provide: AuthService, useValue: {getToken: () => token, logout}},
    ]});
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => requests.verify());

  it('keeps the current session when an earlier request fails', () => {
    http.get('/api/knowledge/articles').subscribe({error: () => undefined});
    token = 'new-session';
    requests.expectOne('/api/knowledge/articles').flush(null, {status: 401, statusText: 'Unauthorized'});
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out when the current session is rejected', () => {
    http.get('/api/knowledge/articles').subscribe({error: () => undefined});
    requests.expectOne('/api/knowledge/articles').flush(null, {status: 401, statusText: 'Unauthorized'});
    expect(logout).toHaveBeenCalledExactlyOnceWith('expired');
  });

  it('keeps the current session when login or a public request fails', () => {
    http.post('/api/auth/login', {}).subscribe({error: () => undefined});
    requests.expectOne('/api/auth/login').flush(null, {status: 401, statusText: 'Unauthorized'});
    http.get('/api/public/tracking/example').subscribe({error: () => undefined});
    requests.expectOne('/api/public/tracking/example').flush(null, {status: 401, statusText: 'Unauthorized'});
    expect(logout).not.toHaveBeenCalled();
  });
});

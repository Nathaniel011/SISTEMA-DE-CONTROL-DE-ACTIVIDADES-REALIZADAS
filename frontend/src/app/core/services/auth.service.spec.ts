import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {afterEach, expect, it, vi} from 'vitest';
import {authInterceptor} from '../interceptors/auth.interceptor';
import {errorInterceptor} from '../interceptors/error.interceptor';
import {AuthService} from './auth.service';
import {NotificationService} from './notification.service';

afterEach(() => {
  localStorage.removeItem('scar-token');
  localStorage.removeItem('scar-user');
});

it('validates a stored session through the interceptors and redirects when it expires', async () => {
  localStorage.setItem('scar-token', 'stored-token');
  localStorage.setItem('scar-user', JSON.stringify({id: 'test-user', username: 'usuario'}));
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  const stopPolling = vi.fn();
  TestBed.configureTestingModule({providers: [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])), provideHttpClientTesting(),
    {provide: Router, useValue: {navigateByUrl}},
    {provide: NotificationService, useValue: {stopPolling, startPolling: vi.fn()}},
  ]});
  const auth = TestBed.inject(AuthService);
  const network = TestBed.inject(HttpTestingController);
  await Promise.resolve();

  const validation = network.expectOne('/api/auth/me');
  expect(validation.request.headers.get('Authorization')).toBe('Bearer stored-token');
  validation.flush(null, {status: 401, statusText: 'Unauthorized'});

  expect(auth.isAuthenticated()).toBe(false);
  expect(auth.expired()).toBe(true);
  expect(localStorage.getItem('scar-token')).toBeNull();
  expect(stopPolling).toHaveBeenCalledOnce();
  expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/auth/login', {replaceUrl: true});
  network.verify();
});

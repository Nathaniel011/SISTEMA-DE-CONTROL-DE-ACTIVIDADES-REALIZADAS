import {HttpEvent, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {finalize, shareReplay, Observable} from 'rxjs';
import {isApiRequest} from '../../../environments/api-request';

const pending = new Map<string, Observable<HttpEvent<unknown>>>();

export function requestKey(request: HttpRequest<unknown>): string | undefined {
  if (request.method !== 'GET' || request.reportProgress || !isApiRequest(request.url)) return undefined;
  return JSON.stringify([
    request.urlWithParams, request.responseType, request.withCredentials, request.credentials,
    request.cache, request.redirect, request.timeout,
    request.headers.keys().map(key => key.toLowerCase()).sort().map(key => [key, request.headers.getAll(key)]),
  ]);
}

export const inFlightInterceptor: HttpInterceptorFn = (request, next) => {
  const key = requestKey(request);
  if (!key) return next(request);
  const existing = pending.get(key);
  if (existing) return existing;
  const shared = next(request).pipe(
    finalize(() => { if (pending.get(key) === shared) pending.delete(key); }),
    shareReplay({bufferSize: 1, refCount: true}),
  );
  pending.set(key, shared);
  return shared;
};

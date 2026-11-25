import {HttpErrorResponse, HttpInterceptorFn} from '@angular/common/http';
import {inject} from '@angular/core';
import {catchError, throwError} from 'rxjs';
import {isApiRequest, isPublicApiRequest} from '../../../environments/api-request';
import {AuthService} from '../services/auth.service';

const AUTH_PUBLIC_PATHS = ['/api/auth/login'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const requestToken = authService.getToken();

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isPublicAuth = isPublicApiRequest(req.url) || AUTH_PUBLIC_PATHS.some(path => req.url.includes(path));
      if (
        error.status === 401 &&
        isApiRequest(req.url) &&
        !isPublicAuth &&
        requestToken && authService.getToken() === requestToken
      ) {
        authService.logout('expired');
      }
      return throwError(() => error);
    })
  );
};

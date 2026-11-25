import {HttpInterceptorFn} from '@angular/common/http';
import {inject} from '@angular/core';
import {isApiRequest, isPublicApiRequest} from '../../../environments/api-request';
import {AuthService} from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (!token || !isApiRequest(req.url) || isPublicApiRequest(req.url)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    })
  );
};

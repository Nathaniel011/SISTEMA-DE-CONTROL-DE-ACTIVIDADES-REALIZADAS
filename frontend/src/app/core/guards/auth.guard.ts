import {inject} from '@angular/core';
import {CanActivateChildFn, CanActivateFn, CanDeactivateFn, Router} from '@angular/router';
import {AuthService} from '../services/auth.service';

const redirectToLogin = (): ReturnType<CanActivateFn> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated() ? true : router.createUrlTree(['/auth/login']);
};

export const authGuard: CanActivateFn = () => redirectToLogin();
export const authChildGuard: CanActivateChildFn = () => redirectToLogin();

interface DraftPage {
  canLeave(): boolean | Promise<boolean>;
}

export const workDraftGuard: CanDeactivateFn<DraftPage> = page =>
  !inject(AuthService).isAuthenticated() || page.canLeave();

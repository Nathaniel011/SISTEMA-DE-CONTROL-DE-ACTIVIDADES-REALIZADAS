import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {PermissionsService, AppRole} from '../services/permissions.service';

export const roleGuard = (allowedRoles: AppRole[]): CanActivateFn => {
  return () => {
    const permissions = inject(PermissionsService);
    const router = inject(Router);

    if (allowedRoles.some(role => permissions.hasRole(role))) {
      return true;
    }

    return router.createUrlTree(['/work/issues']);
  };
};

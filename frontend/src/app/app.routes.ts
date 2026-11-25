import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/role.guard';
import {authChildGuard, workDraftGuard} from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'solicitud',
    loadComponent: () => import('./features/work/work-public-helpdesk/work-public-helpdesk').then(m => m.WorkPublicHelpdesk),
  },
  {
    path: 'seguimiento',
    loadComponent: () => import('./features/work/work-public-helpdesk/work-public-helpdesk').then(m => m.WorkPublicHelpdesk),
    data: {tracking: true},
  },
  {
    path: '',
    loadComponent: () => import('./layouts/app-layout/app-layout').then(module => module.AppLayout),
    canActivateChild: [authChildGuard],
    children: [
      { path: '', redirectTo: 'work/issues', pathMatch: 'full' },
      { path: 'dashboard', redirectTo: 'work/issues', pathMatch: 'full' },
      {
        path: 'work',
        children: [
          { path: '', redirectTo: 'issues', pathMatch: 'full' },
          {
            path: 'issues',
            loadComponent: () =>
              import('./features/work/work-issues/work-issues').then(m => m.WorkIssues),
            data: { breadcrumb: 'Incidencias' },
          },
          {
            path: 'issues/:reference',
            loadComponent: () => import('./features/work/work-issue-page/work-issue-page').then(m => m.WorkIssuePage),
            canDeactivate: [workDraftGuard],
            data: {breadcrumb: 'Ficha de incidencia'},
          },
          {
            path: 'dashboards',
            loadComponent: () =>
              import('./features/work/work-dashboards/work-dashboards').then(m => m.WorkDashboards),
            data: { breadcrumb: 'Paneles' },
          },
          {
            path: 'agile',
            loadComponent: () =>
              import('./features/work/work-board-library/work-board-library').then(m => m.WorkBoardLibrary),
            data: { breadcrumb: 'Tableros' },
          },
          {
            path: 'agile/vista',
            loadComponent: () => import('./features/work/work-issues/work-issues').then(m => m.WorkIssues),
            data: {breadcrumb: 'Tablero global', surface: 'board'},
          },
          {
            path: 'agile/configurado/:viewId',
            loadComponent: () => import('./features/work/work-issues/work-issues').then(m => m.WorkIssues),
            data: {breadcrumb: 'Tablero', surface: 'board'},
          },
          {
            path: 'agile/:boardId',
            loadComponent: () =>
              import('./features/work/work-board/work-board').then(m => m.WorkBoard),
            data: { breadcrumb: 'Tablero' },
          },
          {
            path: 'inbox',
            loadComponent: () =>
              import('./features/work/work-inbox/work-inbox').then(m => m.WorkInbox),
            data: { breadcrumb: 'Bandeja de Entrada' },
          },
          {
            path: 'reports',
            loadComponent: () =>
              import('./features/work/work-reports/work-reports').then(m => m.WorkReports),
            data: { breadcrumb: 'Informes' },
          },
          {
            path: 'projects',
            loadComponent: () => import('./features/work/work-agile/work-agile').then(m => m.WorkAgile),
            data: {breadcrumb: 'Proyectos'},
          },
          {
            path: 'projects/:projectId',
            loadComponent: () => import('./features/work/work-project-space/work-project-space').then(m => m.WorkProjectSpace),
            data: {breadcrumb: 'Proyecto'},
          },
          {
            path: 'knowledge',
            loadComponent: () =>
              import('./features/work/work-knowledge/work-knowledge').then(m => m.WorkKnowledge),
            canDeactivate: [workDraftGuard],
            data: { breadcrumb: 'Base de conocimiento' },
          },
          {
            path: 'timesheets',
            loadComponent: () =>
              import('./features/work/work-timesheets/work-timesheets').then(m => m.WorkTimesheets),
            data: { breadcrumb: 'Partes de horas' },
          },
          {
            path: 'planning',
            loadComponent: () =>
              import('./features/work/work-planning/work-planning').then(m => m.WorkPlanning),
            data: { breadcrumb: 'Planificación' },
          },
          {
            path: 'personal',
            loadComponent: () => import('./features/work/work-personal/work-personal').then(m => m.WorkPersonal),
            data: {breadcrumb: 'Mi espacio'},
          },
          {
            path: 'gantt',
            loadComponent: () =>
              import('./features/work/work-gantt/work-gantt').then(m => m.WorkGantt),
            data: { breadcrumb: 'Diagramas de Gantt' },
          },
          {
            path: 'whiteboards',
            canDeactivate: [workDraftGuard],
            loadComponent: () =>
              import('./features/work/work-whiteboards/work-whiteboards').then(m => m.WorkWhiteboards),
            data: { breadcrumb: 'Pizarras' },
          },
        ],
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users-home/users-home').then(m => m.UsersHome),
        canActivate: [roleGuard(['ADMIN', 'CHIEF'])],
        data: { breadcrumb: 'Usuarios' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/users/users-index/users-index').then(m => m.UsersIndex),
          },
          {
            path: 'create',
            loadComponent: () =>
              import('./features/users/users-form/users-form').then(m => m.UsersForm),
            data: { breadcrumb: 'Nuevo' },
          },
          {
            path: ':id',
            children: [
              {
                path: 'show',
                data: { breadcrumb: 'Ver' },
                loadComponent: () =>
                  import('./features/users/users-form/users-form').then(m => m.UsersForm),
              },
              {
                path: 'edit',
                data: { breadcrumb: 'Editar' },
                loadComponent: () =>
                  import('./features/users/users-form/users-form').then(m => m.UsersForm),
              },
            ],
          },
        ],
      },
      {
        path: 'account/profile',
        loadComponent: () =>
          import('./features/account/account-profile/account-profile').then(m => m.AccountProfile),
        data: { breadcrumb: 'Mi perfil' },
      },
      {
        path: 'account/password',
        loadComponent: () =>
          import('./features/account/account-password/account-password').then(m => m.AccountPassword),
        data: { breadcrumb: 'Cambiar contraseña' },
      },
    ],
  },
  { path: 'not-found', loadComponent: () => import('./layouts/app-not-found/app-not-found').then(module => module.AppNotFound) },
  { path: 'auth/login', loadComponent: () => import('./layouts/app-login/app-login').then(module => module.AppLogin), canActivate: [guestGuard] },
  { path: '**', redirectTo: '/not-found' },
];

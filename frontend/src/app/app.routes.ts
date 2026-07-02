import { Routes } from '@angular/router';
import { AppLayout } from './layouts/app-layout/app-layout';
import { AppNotFound } from './layouts/app-not-found/app-not-found';
import { AppLogin } from './layouts/app-login/app-login';
import { roleGuard } from './core/guards/role.guard';
import { authChildGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
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
            path: 'dashboards',
            loadComponent: () =>
              import('./features/work/work-dashboards/work-dashboards').then(m => m.WorkDashboards),
            data: { breadcrumb: 'Paneles' },
          },
          {
            path: 'agile',
            loadComponent: () =>
              import('./features/work/work-agile/work-agile').then(m => m.WorkAgile),
            data: { breadcrumb: 'Tableros' },
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
          { path: 'projects', redirectTo: 'agile', pathMatch: 'full' },
          {
            path: 'knowledge',
            loadComponent: () =>
              import('./features/work/work-knowledge/work-knowledge').then(m => m.WorkKnowledge),
            data: { breadcrumb: 'Base de conocimiento' },
          },
          {
            path: 'timesheets',
            loadComponent: () =>
              import('./features/work/work-timesheets/work-timesheets').then(m => m.WorkTimesheets),
            data: { breadcrumb: 'Partes de horas' },
          },
          {
            path: 'gantt',
            loadComponent: () =>
              import('./features/work/work-gantt/work-gantt').then(m => m.WorkGantt),
            data: { breadcrumb: 'Diagramas de Gantt' },
          },
          {
            path: 'whiteboards',
            loadComponent: () =>
              import('./features/work/work-whiteboards/work-whiteboards').then(m => m.WorkWhiteboards),
            data: { breadcrumb: 'Pizarras' },
          },
        ],
      },
      {
        path: 'attentions',
        loadComponent: () =>
          import('./features/attentions/attentions-home/attentions-home').then(m => m.AttentionsHome),
        data: { breadcrumb: 'Atenciones' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/attentions/attentions-index/attentions-index').then(m => m.AttentionsIndex),
          },
          {
            path: 'create',
            loadComponent: () =>
              import('./features/attentions/attentions-form/attentions-form').then(m => m.AttentionsForm),
            data: { breadcrumb: 'Nuevo' },
          },
          {
            path: ':id/show',
            loadComponent: () =>
              import('./features/attentions/attentions-form/attentions-form').then(m => m.AttentionsForm),
            data: { breadcrumb: 'Ver' },
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
        path: 'deceased',
        loadComponent: () =>
          import('./features/deceased/deceased-home/deceased-home').then(m => m.DeceasedHome),
        data: { breadcrumb: 'Padrón de difuntos' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/deceased/deceased-index/deceased-index').then(m => m.DeceasedIndex),
          },
          {
            path: 'create',
            loadComponent: () =>
              import('./features/deceased/deceased-form/deceased-form').then(m => m.DeceasedForm),
            data: { breadcrumb: 'Nuevo' },
          },
          {
            path: ':id/show',
            loadComponent: () =>
              import('./features/deceased/deceased-form/deceased-form').then(m => m.DeceasedForm),
            data: { breadcrumb: 'Ver' },
          },
        ],
      },
      {
        path: 'service-catalog',
        loadComponent: () =>
          import('./features/service-catalog/service-catalog-home/service-catalog-home').then(
            m => m.ServiceCatalogHome
          ),
        data: { breadcrumb: 'Catálogo de servicios' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/service-catalog/service-catalog-index/service-catalog-index').then(
                m => m.ServiceCatalogIndex
              ),
          },
          {
            path: 'create',
            loadComponent: () =>
              import('./features/service-catalog/service-catalog-form/service-catalog-form').then(
                m => m.ServiceCatalogForm
              ),
            data: { breadcrumb: 'Nuevo' },
          },
          {
            path: ':id/show',
            loadComponent: () =>
              import('./features/service-catalog/service-catalog-form/service-catalog-form').then(
                m => m.ServiceCatalogForm
              ),
            data: { breadcrumb: 'Ver' },
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
  { path: 'not-found', component: AppNotFound },
  { path: 'auth/login', component: AppLogin, canActivate: [guestGuard] },
  { path: '**', redirectTo: '/not-found' },
];

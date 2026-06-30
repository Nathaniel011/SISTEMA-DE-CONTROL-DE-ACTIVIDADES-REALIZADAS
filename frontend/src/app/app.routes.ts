import { Routes } from '@angular/router';
import { AppLayout } from './layouts/app-layout/app-layout';
import { AppNotFound } from './layouts/app-not-found/app-not-found';
import {AttentionsForm} from './features/attentions/attentions-form/attentions-form';
import {AttentionsHome} from './features/attentions/attentions-home/attentions-home';
import {AttentionsIndex} from './features/attentions/attentions-index/attentions-index';
import {UsersHome} from './features/users/users-home/users-home';
import {AppLogin} from './layouts/app-login/app-login';
import {UsersIndex} from './features/users/users-index/users-index';
import {UsersForm} from './features/users/users-form/users-form';
import {authChildGuard} from './core/guards/auth.guard';
import {guestGuard} from './core/guards/guest.guard';
import {AccountProfile} from './features/account/account-profile/account-profile';
import {AccountPassword} from './features/account/account-password/account-password';
import {DeceasedHome} from './features/deceased/deceased-home/deceased-home';
import {DeceasedForm} from './features/deceased/deceased-form/deceased-form';
import {DeceasedIndex} from './features/deceased/deceased-index/deceased-index';
import {ServiceCatalogForm} from './features/service-catalog/service-catalog-form/service-catalog-form';
import {ServiceCatalogHome} from './features/service-catalog/service-catalog-home/service-catalog-home';
import {ServiceCatalogIndex} from './features/service-catalog/service-catalog-index/service-catalog-index';
import {WorkIssues} from './features/work/work-issues/work-issues';
import {WorkProjects} from './features/work/work-projects/work-projects';
import {WorkAgile} from './features/work/work-agile/work-agile';
import {WorkBoard} from './features/work/work-board/work-board';
import {WorkTimesheets} from './features/work/work-timesheets/work-timesheets';
import {WorkDashboards} from './features/work/work-dashboards/work-dashboards';
import {WorkReports} from './features/work/work-reports/work-reports';
import {WorkGantt} from './features/work/work-gantt/work-gantt';
import {WorkInbox} from './features/work/work-inbox/work-inbox';
import {WorkKnowledge} from './features/work/work-knowledge/work-knowledge';
import {WorkWhiteboards} from './features/work/work-whiteboards/work-whiteboards';

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
          { path: 'issues', component: WorkIssues, data: { breadcrumb: 'Incidencias' } },
          {
            path: 'dashboards',
            component: WorkDashboards,
            data: { breadcrumb: 'Paneles' },
          },
          { path: 'agile', component: WorkAgile, data: { breadcrumb: 'Tableros' } },
          { path: 'agile/:boardId', component: WorkBoard, data: { breadcrumb: 'Tablero' } },
          { path: 'inbox', component: WorkInbox, data: { breadcrumb: 'Bandeja de Entrada' } },
          {
            path: 'reports',
            component: WorkReports,
            data: { breadcrumb: 'Informes' },
          },
          { path: 'projects', component: WorkProjects, data: { breadcrumb: 'Proyectos' } },
          {
            path: 'knowledge',
            component: WorkKnowledge,
            data: { breadcrumb: 'Base de conocimiento' },
          },
          { path: 'timesheets', component: WorkTimesheets, data: { breadcrumb: 'Partes de horas' } },
          {
            path: 'gantt',
            component: WorkGantt,
            data: { breadcrumb: 'Diagramas de Gantt' },
          },
          {
            path: 'whiteboards',
            component: WorkWhiteboards,
            data: { breadcrumb: 'Pizarras' },
          },
        ],
      },
      {
        path: 'attentions',
        component: AttentionsHome,
        data: { breadcrumb: 'Atenciones' },
        children: [
          { path: '', component: AttentionsIndex },
          { path: 'create', component: AttentionsForm, data: { breadcrumb: 'Nuevo' } },
          { path: ':id/show', component: AttentionsForm, data: { breadcrumb: 'Ver' } },
        ]
      },
      {
        path: 'users',
        component: UsersHome,
        data: { breadcrumb: 'Usuarios' },
        children: [
          { path: '', component: UsersIndex },
          { path: 'create', component: UsersForm, data: { breadcrumb: 'Nuevo' }, },
          { path: ':id', children: [
              {
                path: 'show',
                data: { breadcrumb: 'Ver' },
                component: UsersForm
              },
              {
                path: 'edit',
                data: { breadcrumb: 'Editar' },
                component: UsersForm
              },
            ] }
        ]
      },
      {
        path: 'deceased',
        component: DeceasedHome,
        data: { breadcrumb: 'Padrón de difuntos' },
        children: [
          { path: '', component: DeceasedIndex },
          { path: 'create', component: DeceasedForm, data: { breadcrumb: 'Nuevo' } },
          { path: ':id/show', component: DeceasedForm, data: { breadcrumb: 'Ver' } },
        ]
      },
      {
        path: 'service-catalog',
        component: ServiceCatalogHome,
        data: { breadcrumb: 'Catálogo de servicios' },
        children: [
          { path: '', component: ServiceCatalogIndex },
          { path: 'create', component: ServiceCatalogForm, data: { breadcrumb: 'Nuevo' } },
          { path: ':id/show', component: ServiceCatalogForm, data: { breadcrumb: 'Ver' } },
        ]
      },
      { path: 'account/profile', component: AccountProfile, data: { breadcrumb: 'Mi perfil' } },
      { path: 'account/password', component: AccountPassword, data: { breadcrumb: 'Cambiar contraseña' } },
    ]
  },
  { path: 'not-found', component: AppNotFound },
  { path: 'auth/login', component: AppLogin, canActivate: [guestGuard] },
  { path: '**', redirectTo: '/not-found' },
];

import {DatePipe} from '@angular/common';
import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {AppSidebar} from '../app-sidebar/app-sidebar';
import {BreadcrumbModule} from 'primeng/breadcrumb';
import {AvatarModule} from 'primeng/avatar';
import {DrawerModule} from 'primeng/drawer';
import {ButtonModule} from 'primeng/button';
import {BadgeModule} from 'primeng/badge';
import {NavigationEnd, Router, RouterLink, RouterOutlet} from '@angular/router';
import {AppService} from '../../core/services/app.service';
import {NavigationItem} from '../navigation-item';
import {DialogModule} from 'primeng/dialog';
import {Tag} from 'primeng/tag';
import {AuthService} from '../../core/services/auth.service';
import {NotificationService} from '../../core/services/notification.service';
import {WORK_NAV_ITEMS} from '../../features/work/work-nav';
import {environment} from '../../../environments/environment';
import {filter} from 'rxjs';

@Component({
  selector: 'app-layout',
  imports: [
    AppSidebar,
    BreadcrumbModule,
    AvatarModule,
    DrawerModule,
    ButtonModule,
    DialogModule,
    BadgeModule,
    Tag,
    RouterOutlet,
    RouterLink,
    DatePipe,
  ],
  templateUrl: './app-layout.html'
})
export class AppLayout implements OnInit {
  private router = inject(Router);
  appService = inject(AppService);
  authService = inject(AuthService);
  notificationService = inject(NotificationService);

  accountDrawerOpen = false;
  drawerOpen = false;
  logoutDialogOpen = false;
  notificationsOpen = false;
  isWorkView = signal(this.router.url.startsWith('/work'));
  useApi = environment.useApi;

  accountLinks = [
    {
      label: 'Mi perfil',
      description: 'Datos personales y correo',
      icon: 'pi pi-user',
      routerLink: '/account/profile'
    },
    {
      label: 'Cambiar contraseña',
      description: 'Actualizar credenciales de acceso',
      icon: 'pi pi-key',
      routerLink: '/account/password'
    }
  ];

  userDisplayName = computed(() => this.authService.currentUser()?.fullName ?? 'Invitado');
  unreadNotifications = computed(() => this.notificationService.unreadCount());

  menuItems: NavigationItem[] = WORK_NAV_ITEMS.map(item => ({
    icon: item.icon,
    label: item.label,
    routerLink: item.route,
  }));

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.isWorkView.set(this.router.url.startsWith('/work')));
  }

  ngOnInit(): void {
    if (this.useApi && this.authService.isAuthenticated()) {
      this.notificationService.startPolling();
    }
  }

  openNotifications(): void {
    this.notificationsOpen = true;
    void this.notificationService.refresh();
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.notificationService.markRead(id);
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.notificationService.markAllRead();
  }

  openIssueFromNotification(issueId: string | null): void {
    if (!issueId) {
      return;
    }
    this.notificationsOpen = false;
    this.router.navigate(['/work/issues'], { queryParams: { issue: issueId } });
  }

  closeNavigationDrawers(): void {
    this.drawerOpen = false;
    this.accountDrawerOpen = false;
  }

  navigateTo(route: string): void {
    this.closeNavigationDrawers();
    this.router.navigateByUrl(route);
  }

  openLogoutDialog(): void {
    this.logoutDialogOpen = true;
  }

  cancelLogout(): void {
    this.logoutDialogOpen = false;
  }

  confirmLogout(): void {
    this.logoutDialogOpen = false;
    this.closeNavigationDrawers();
    this.authService.logout();
  }
}

import {DatePipe} from '@angular/common';
import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {AppSidebar} from '../app-sidebar/app-sidebar';
import {AccountUsersPanel} from './account-users-panel/account-users-panel';
import {BreadcrumbModule} from 'primeng/breadcrumb';
import {AvatarModule} from 'primeng/avatar';
import {DrawerModule} from 'primeng/drawer';
import {ButtonModule} from 'primeng/button';
import {BadgeModule} from 'primeng/badge';
import {NavigationEnd, Router, RouterOutlet} from '@angular/router';
import {AppService} from '../../core/services/app.service';
import {NavigationItem} from '../navigation-item';
import {DialogModule} from 'primeng/dialog';
import {Tag} from 'primeng/tag';
import {AuthService} from '../../core/services/auth.service';
import {NotificationService} from '../../core/services/notification.service';
import {PermissionsService} from '../../core/services/permissions.service';
import {WORK_NAV_ITEMS} from '../../features/work/work-nav';
import {environment} from '../../../environments/environment';
import {filter} from 'rxjs';

type AccountPanel = 'menu' | 'users';

@Component({
  selector: 'app-layout',
  imports: [
    AppSidebar,
    AccountUsersPanel,
    BreadcrumbModule,
    AvatarModule,
    DrawerModule,
    ButtonModule,
    DialogModule,
    BadgeModule,
    Tag,
    RouterOutlet,
    DatePipe,
  ],
  templateUrl: './app-layout.html'
})
export class AppLayout implements OnInit {
  private router = inject(Router);
  appService = inject(AppService);
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  permissions = inject(PermissionsService);

  accountDrawerOpen = false;
  accountPanel = signal<AccountPanel>('menu');
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
  accountDrawerStyle = computed(() =>
    this.accountPanel() === 'users'
      ? { width: 'min(28rem, 100vw)' }
      : { width: '20rem' }
  );
  accountDrawerHeader = computed(() =>
    this.accountPanel() === 'users' ? 'Administración de usuarios' : 'Mi cuenta'
  );

  menuItems: NavigationItem[] = WORK_NAV_ITEMS.map(item => ({
    icon: item.icon,
    label: item.label,
    routerLink: item.route,
  }));

  allMenuItems = computed<NavigationItem[]>(() => [...this.menuItems]);

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

  openAccountDrawer(): void {
    this.accountPanel.set('menu');
    this.accountDrawerOpen = true;
  }

  onAccountDrawerVisibleChange(visible: boolean): void {
    this.accountDrawerOpen = visible;
    if (!visible) {
      this.accountPanel.set('menu');
    }
  }

  openUsersPanel(): void {
    if (!this.permissions.canManageUsers()) {
      return;
    }
    this.accountPanel.set('users');
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
    this.accountPanel.set('menu');
  }

  navigateTo(route: string): void {
    this.closeNavigationDrawers();
    this.router.navigateByUrl(route);
  }

  roleLabel(role: string): string {
    return this.permissions.roleLabel(role);
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

import {DatePipe} from '@angular/common';
import {BreakpointObserver} from '@angular/cdk/layout';
import {Component, computed, ElementRef, inject, OnInit, signal, viewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AppSidebar} from '../app-sidebar/app-sidebar';
import {AccountUsersPanel} from './account-users-panel/account-users-panel';
import {ThemePicker} from '../theme-picker/theme-picker';
import {BreadcrumbModule} from 'primeng/breadcrumb';
import {AvatarModule} from 'primeng/avatar';
import {DrawerModule} from 'primeng/drawer';
import {ButtonModule} from 'primeng/button';
import {BadgeModule} from 'primeng/badge';
import {NavigationEnd, Router, RouterLink, RouterOutlet, UrlTree} from '@angular/router';
import {AppService} from '../../core/services/app.service';
import {NavigationItem} from '../navigation-item';
import {DialogModule} from 'primeng/dialog';
import {Tag} from 'primeng/tag';
import {AuthService} from '../../core/services/auth.service';
import {NotificationService} from '../../core/services/notification.service';
import {PermissionsService} from '../../core/services/permissions.service';
import {WORK_NAV_ITEMS} from '../../features/work/work-nav';
import {WorkBoardSwitcher} from '../../features/work/work-board-switcher/work-board-switcher';
import {WorkService} from '../../core/services/work.service';
import {environment} from '../../../environments/environment';
import {filter} from 'rxjs';

type AccountPanel = 'menu' | 'users';
type WorkShortcut = 'inbox' | 'planning' | 'agile';

@Component({
  selector: 'app-layout',
  imports: [
    AppSidebar,
    AccountUsersPanel,
    ThemePicker,
    BreadcrumbModule,
    AvatarModule,
    DrawerModule,
    ButtonModule,
    DialogModule,
    BadgeModule,
    Tag,
    RouterLink,
    RouterOutlet,
    DatePipe,
    WorkBoardSwitcher,
  ],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout implements OnInit {
  private router = inject(Router);
  private boardSwitcher = viewChild(WorkBoardSwitcher);
  private work = inject(WorkService);
  appService = inject(AppService);
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  permissions = inject(PermissionsService);

  accountDrawerOpen = false;
  accountPanel = signal<AccountPanel>('menu');
  drawerOpen = false;
  protected readonly desktopNavOpen = signal(true);
  private readonly mobileNavButton = viewChild.required<ElementRef<HTMLButtonElement>>('mobileNavButton');
  logoutDialogOpen = false;
  notificationsOpen = false;
  private readonly workArea = signal<string | null>(null);
  private readonly lastWorkViews = signal<Partial<Record<WorkShortcut, UrlTree>>>({});
  protected readonly activeShortcut = this.workArea.asReadonly();
  readonly isWorkView = computed(() => this.workArea() !== null);
  protected readonly boardLink = computed(() => this.lastWorkViews().agile ?? this.router.parseUrl('/work/agile/vista'));
  protected readonly inboxLink = computed(() => this.lastWorkViews().inbox ?? this.router.parseUrl('/work/inbox'));
  protected readonly plannerLink = computed(() => {
    const saved = this.lastWorkViews().planning;
    const project = this.boardProject();
    if (saved && (this.activeShortcut() === 'planning' || !project || saved.queryParamMap.get('board') === project)) return saved;
    return this.router.createUrlTree(['/work/planning'], {queryParams: {board: project}});
  });
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
      : { width: 'min(20rem, 100vw)' }
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
    inject(BreakpointObserver).observe('(min-width: 48rem)').pipe(takeUntilDestroyed()).subscribe(({matches}) => {
      if (matches) this.drawerOpen = false;
    });
    this.rememberWorkView(this.router.url);
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(event => this.rememberWorkView(event.urlAfterRedirects));
  }

  ngOnInit(): void {
    if (this.useApi && this.authService.isAuthenticated()) {
      this.notificationService.startPolling();
    }
  }

  openBoardSwitcher(): void {
    this.boardSwitcher()?.open(this.boardLink());
  }

  private rememberWorkView(path: string): void {
    const url = this.router.parseUrl(path);
    const segments = url.root.children['primary']?.segments;
    const section = segments?.[0]?.path === 'work' ? segments[1]?.path ?? '' : null;
    this.workArea.set(section);
    if (section !== 'inbox' && section !== 'planning' && section !== 'agile') return;
    if (section === 'agile' && !segments?.[2]) return;
    const query = {...url.queryParams};
    delete query['issue'];
    this.lastWorkViews.update(views => ({...views, [section]: new UrlTree(url.root, query, url.fragment)}));
  }

  private boardProject(): string | null {
    const board = this.boardLink().root.children['primary']?.segments[2]?.path;
    return board && this.work.getBoard(board)?.type === 'standard' ? board : null;
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

  protected restoreNavFocus(): void {
    const button = this.mobileNavButton().nativeElement;
    if (button.getClientRects().length) button.focus({preventScroll: true});
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

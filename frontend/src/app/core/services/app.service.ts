import {inject, Injectable, signal} from '@angular/core';
import {MenuItem} from 'primeng/api';
import {ActivatedRoute, NavigationEnd, Params, Router} from '@angular/router';
import {filter} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  breadcrumbs = signal<MenuItem[]>([]);
  isBaseRoute = signal(true);
  home: MenuItem = {
    icon: 'pi pi-home',
    routerLink: '/work/issues'
  };

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        const breadcrumbs: MenuItem[] = [];
        let currentRoute = this.route.root;
        let url = '';
        while(currentRoute.firstChild){
          currentRoute = currentRoute.firstChild;
          const routeConfig = currentRoute.routeConfig;
          if(!routeConfig?.path){
            continue;
          }
          const path = routeConfig.path;
          const breadcrumbLabel = currentRoute.snapshot.data['breadcrumb'];
          url += '/' + this.resolvePath(path, currentRoute.snapshot.params);
          if(breadcrumbLabel){
            breadcrumbs.push({
              label: breadcrumbLabel,
              routerLink: url,
            });
          }
        }
        if (breadcrumbs.length > 0) {
          delete breadcrumbs[breadcrumbs.length - 1].routerLink;
        }
        this.breadcrumbs.set(breadcrumbs);
        this.isBaseRoute.set(breadcrumbs.length<=1);
      });
  }

  private resolvePath(path: string, params: Params): string {
    return path.replace(/:([^/]+)/g, (_, key) => params[key]);
  }
}

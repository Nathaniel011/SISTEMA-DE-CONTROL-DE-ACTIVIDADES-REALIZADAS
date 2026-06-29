import {Component, input, output} from '@angular/core';
import {MenuModule} from 'primeng/menu';
import {AppMenuItem} from '../app-menu-item/app-menu-item';
import {NavigationItem} from '../navigation-item';

@Component({
  selector: 'app-sidebar',
  imports: [
    MenuModule,
    AppMenuItem
  ],
  templateUrl: './app-sidebar.html'
})
export class AppSidebar {
  isMobile = input(false);
  menuItems = input<NavigationItem[]>([]);
  itemClick = output<void>();

  handleItemClick(): void {
    this.itemClick.emit();
  }
}

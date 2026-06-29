import {Component, computed, input, output, signal, ViewChild} from '@angular/core';
import {Menu} from 'primeng/menu';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {NavigationItem} from '../navigation-item';

@Component({
  selector: 'app-menu-item',
  imports: [
    RouterLink,
    RouterLinkActive,
    Menu
  ],
  templateUrl: './app-menu-item.html'
})
export class AppMenuItem {
  isExpanded = signal(false);

  item = input.required<NavigationItem>();
  isMobile = input(false);
  itemClick = output<void>();

  @ViewChild('popupMenu') popupMenu!: Menu;

  hasSubmenu = computed(() => (this.item().items?.length ?? 0) > 0);

  getAngleIcon = computed(() => {
    if (!this.hasSubmenu()) return '';

    if (this.isMobile()) {
      return this.isExpanded() ? 'pi-angle-up' : 'pi-angle-down';
    }
    return 'pi-angle-right';
  });

  handleClick(event: Event): void {
    if (this.hasSubmenu()) {
      event.preventDefault();

      if (this.isMobile()) {
        this.isExpanded.set(!this.isExpanded());
      } else {
        this.showPopupMenu(event);
      }
    } else {
      // Regular navigation item
      this.itemClick.emit();
    }
  }

  handleSubItemClick(): void {
    this.isExpanded.set(false);
    this.itemClick.emit();
  }

  showPopupMenu(event: Event): void {
    if (this.popupMenu && this.item().items) {
      this.popupMenu.model = this.item().items!.map(subItem => ({
        label: subItem.label,
        icon: subItem.icon,
        routerLink: subItem.routerLink,
        command: () => this.handleSubItemClick()
      }));
      this.popupMenu.toggle(event);
    }
  }
}

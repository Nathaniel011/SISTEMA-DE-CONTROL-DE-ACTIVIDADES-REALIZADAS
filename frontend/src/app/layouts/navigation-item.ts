export interface NavigationItem {
  icon: string;
  label: string;
  routerLink?: string;
  items?: NavigationItem[];
}

import {ChangeDetectionStrategy, Component, computed, inject} from '@angular/core';
import {ButtonModule} from 'primeng/button';
import {ThemeService} from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule],
  template: `
    <button pButton type="button" severity="secondary" [text]="true" [rounded]="true"
      class="min-h-11 min-w-11" [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
      [title]="action()" [attr.aria-label]="action()"
      (click)="theme.setPreference(theme.isDark() ? 'light' : 'dark')"></button>
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeService);
  protected readonly action = computed(() => this.theme.isDark() ? 'Activar tema claro' : 'Activar tema oscuro');
}

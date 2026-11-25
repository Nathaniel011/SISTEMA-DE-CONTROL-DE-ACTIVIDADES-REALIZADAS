import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {ChartModule} from 'primeng/chart';
import {WorkService} from '../../../core/services/work.service';
import {ThemeService} from '../../../core/services/theme.service';
import {workBarChartOptions} from '../work-chart-options';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-dashboards',
  imports: [FormsModule, RouterLink, Button, ChartModule],
  templateUrl: './work-dashboards.html',
})
export class WorkDashboards implements OnInit {
  workService = inject(WorkService);
  private readonly theme = inject(ThemeService);

  loadError = signal<string | null>(null);
  startDate = signal('');
  endDate = signal('');
  appliedRange = signal<{createdFrom: string | null; createdTo: string | null}>({createdFrom: null, createdTo: null});

  metrics = computed(() => {
    const apiMetrics = this.workService.dashboardMetrics();
    if (apiMetrics) {
      return apiMetrics;
    }
    return this.workService.getDashboardMetrics();
  });

  statusChart = computed(() => {
    const data = this.metrics().byStatus;
    return {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: ['#738399', '#009587', '#397e76'],
        borderRadius: 6,
      }],
    };
  });

  priorityChart = computed(() => {
    const data = this.metrics().byPriority;
    return {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: ['#de4747', '#b47708', '#738399'],
        borderRadius: 6,
      }],
    };
  });

  readonly chartOptions = computed(() => workBarChartOptions(this.theme.isDark(), true));

  formatMinutes = formatWorkMinutes;

  ngOnInit(): void {
    void this.reloadDashboard();
  }

  async reloadDashboard(): Promise<void> {
    this.loadError.set(null);
    const startDate = this.startDate() || undefined;
    const endDate = this.endDate() || undefined;
    try {
      await this.workService.loadDashboard({startDate, endDate});
      this.appliedRange.set({createdFrom: startDate ?? null, createdTo: endDate ?? null});
    } catch {
      this.loadError.set('No se pudieron cargar las métricas del panel.');
    }
  }

  issueFilters(group?: 'open' | 'progress', scope?: 'unassigned') {
    return {...this.appliedRange(), group, scope, view: 'list'};
  }

  clearFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    void this.reloadDashboard();
  }
}

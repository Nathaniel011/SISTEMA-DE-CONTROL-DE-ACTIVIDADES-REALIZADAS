import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {ChartModule} from 'primeng/chart';
import {WorkService} from '../../../core/services/work.service';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-dashboards',
  imports: [FormsModule, RouterLink, Button, ChartModule],
  templateUrl: './work-dashboards.html',
})
export class WorkDashboards implements OnInit {
  workService = inject(WorkService);

  loadError = signal<string | null>(null);
  startDate = signal('');
  endDate = signal('');

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
        backgroundColor: ['#94a3b8', '#14b8a6', '#0f766e'],
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
        backgroundColor: ['#ef4444', '#f59e0b', '#64748b'],
        borderRadius: 6,
      }],
    };
  });

  chartOptions = {
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { display: false } },
      y: { ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(148,163,184,0.15)' } },
    },
  };

  formatMinutes = formatWorkMinutes;

  ngOnInit(): void {
    void this.reloadDashboard();
  }

  async reloadDashboard(): Promise<void> {
    this.loadError.set(null);
    await this.workService.loadDashboard({
      startDate: this.startDate() || undefined,
      endDate: this.endDate() || undefined,
    }).catch(() => {
      this.loadError.set('No se pudieron cargar las métricas del panel.');
    });
  }

  clearFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    void this.reloadDashboard();
  }
}

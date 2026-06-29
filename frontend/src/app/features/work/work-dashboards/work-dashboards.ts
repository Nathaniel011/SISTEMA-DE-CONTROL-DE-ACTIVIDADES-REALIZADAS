import {Component, computed, inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {ChartModule} from 'primeng/chart';
import {WorkService} from '../../../core/services/work.service';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-dashboards',
  imports: [RouterLink, Button, ChartModule],
  templateUrl: './work-dashboards.html',
})
export class WorkDashboards {
  workService = inject(WorkService);

  metrics = computed(() => this.workService.getDashboardMetrics());

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
}

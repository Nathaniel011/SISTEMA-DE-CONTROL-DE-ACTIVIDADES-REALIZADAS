import {Component, computed, inject} from '@angular/core';
import {ChartModule} from 'primeng/chart';
import {TableModule} from 'primeng/table';
import {WorkService} from '../../../core/services/work.service';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-reports',
  imports: [ChartModule, TableModule],
  templateUrl: './work-reports.html',
})
export class WorkReports {
  workService = inject(WorkService);

  timeByMember = computed(() => this.workService.getTimeByMember());
  metrics = computed(() => this.workService.getDashboardMetrics());

  timeChart = computed(() => {
    const data = this.timeByMember().filter(r => r.minutes > 0);
    return {
      labels: data.map(r => r.name),
      datasets: [{
        label: 'Horas registradas (min)',
        data: data.map(r => r.minutes),
        backgroundColor: '#14b8a6',
        borderRadius: 6,
      }],
    };
  });

  chartOptions = {
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { display: false } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.15)' } },
    },
  };

  formatMinutes = formatWorkMinutes;
}

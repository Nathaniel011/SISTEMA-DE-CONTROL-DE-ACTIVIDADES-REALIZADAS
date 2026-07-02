import {Component, inject, OnInit, signal, computed} from '@angular/core';
import {ChartModule} from 'primeng/chart';
import {TableModule} from 'primeng/table';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Select} from 'primeng/select';
import {WorkService} from '../../../core/services/work.service';
import {WorkApiService} from '../../../core/services/work-api.service';
import {firstValueFrom} from 'rxjs';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-reports',
  imports: [ChartModule, TableModule, FormsModule, Button, Select],
  templateUrl: './work-reports.html',
})
export class WorkReports implements OnInit {
  workService = inject(WorkService);
  workApi = inject(WorkApiService);

  selectedBoardId = signal<string | null>(null);
  startDate = signal<string | null>(null);
  endDate = signal<string | null>(null);
  loading = signal(false);

  summary = signal({ totalIssues: 0, completed: 0, criticalOpen: 0, totalHours: 0 });
  timePerMember = signal<{ memberId: string; memberName: string; totalHours: number }[]>([]);

  boardOptions = computed(() => [
    { label: 'Todos los tableros', value: null },
    ...this.workService.boards().map(b => ({ label: b.name, value: b.id }))
  ]);

  timeChart = computed(() => {
    const data = this.timePerMember().filter(r => r.totalHours > 0);
    return {
      labels: data.map(r => r.memberName),
      datasets: [{
        label: 'Horas registradas',
        data: data.map(r => r.totalHours),
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

  ngOnInit(): void {
    this.loadReports();
  }

  async loadReports(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.workApi.getReports(this.selectedBoardId() ?? undefined, this.startDate() ?? undefined, this.endDate() ?? undefined)
      );
      this.summary.set(data.summary);
      this.timePerMember.set(data.timePerMember);
    } finally {
      this.loading.set(false);
    }
  }

  formatMinutes = formatWorkMinutes;
  formatHours = (hours: number) => `${hours.toFixed(1)}h`;
}

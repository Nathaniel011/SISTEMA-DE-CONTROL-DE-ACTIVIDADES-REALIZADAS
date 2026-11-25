import {Component, inject, OnInit, signal, computed} from '@angular/core';
import {ChartModule} from 'primeng/chart';
import {TableModule} from 'primeng/table';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Select} from 'primeng/select';
import {WorkService} from '../../../core/services/work.service';
import {ThemeService} from '../../../core/services/theme.service';
import {workBarChartOptions} from '../work-chart-options';
import {WorkApiService} from '../../../core/services/work-api.service';
import {firstValueFrom} from 'rxjs';
import {formatWorkMinutes} from '../work.utils';

@Component({
  selector: 'app-work-reports',
  imports: [ChartModule, TableModule, FormsModule, Button, Select, RouterLink],
  templateUrl: './work-reports.html',
})
export class WorkReports implements OnInit {
  workService = inject(WorkService);
  private readonly theme = inject(ThemeService);
  workApi = inject(WorkApiService);

  selectedBoardId = signal<string | null>(null);
  startDate = signal<string | null>(null);
  endDate = signal<string | null>(null);
  loading = signal(false);
  error = signal('');
  applied = signal<{board: string | null; createdFrom: string | null; createdTo: string | null} | null>(null);

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
        backgroundColor: '#009587',
        borderRadius: 6,
      }],
    };
  });

  readonly chartOptions = computed(() => workBarChartOptions(this.theme.isDark()));

  ngOnInit(): void {
    this.loadReports();
  }

  async loadReports(): Promise<void> {
    if (this.loading()) return;
    const board = this.selectedBoardId();
    const createdFrom = this.startDate();
    const createdTo = this.endDate();
    if (createdFrom && createdTo && createdFrom > createdTo) {
      this.error.set('La fecha de inicio debe ser anterior o igual a la fecha final.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.workApi.getReports(board ?? undefined, createdFrom ?? undefined, createdTo ?? undefined)
      );
      this.summary.set(data.summary);
      this.timePerMember.set(data.timePerMember);
      this.applied.set({board, createdFrom, createdTo});
    } catch {
      this.error.set('No se pudieron consultar los informes. Vuelve a aplicar los filtros para reintentar.');
    } finally {
      this.loading.set(false);
    }
  }

  issueFilters(group?: 'open' | 'closed', priority?: 'critical') {
    return {...this.applied(), group, priority, view: 'list'};
  }

  formatMinutes = formatWorkMinutes;
  formatHours = (hours: number) => `${hours.toFixed(1)}h`;
}

import {Component} from '@angular/core';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {ChartModule} from 'primeng/chart';
import {Toolbar} from 'primeng/toolbar';

@Component({
  selector: 'app-dashboard-home',
  imports: [
    Card,
    Toolbar,
    Button,
    ChartModule
  ],
  templateUrl: './dashboard-home.html',
})
export class DashboardHome {
  summaryCards = [
    {
      title: 'Atenciones hoy',
      value: '18',
      caption: '4 pendientes de pago',
      icon: 'pi pi-receipt',
      tone: 'bg-teal-900 text-white'
    },
    {
      title: 'Difuntos registrados',
      value: '124',
      caption: '12 nuevos esta semana',
      icon: 'pi pi-book',
      tone: 'bg-teal-50 text-teal-900'
    },
    {
      title: 'Servicios confirmados',
      value: '37',
      caption: 'Bs 18,540 facturados',
      icon: 'pi pi-briefcase',
      tone: 'bg-teal-100 text-teal-800'
    },
    {
      title: 'Pagos pendientes',
      value: '9',
      caption: 'Bs 4,280 por regularizar',
      icon: 'pi pi-wallet',
      tone: 'bg-amber-50 text-amber-900'
    }
  ];

  attentionTrendData = {
    labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    datasets: [
      {
        label: 'Atenciones',
        data: [9, 12, 11, 15, 14, 8, 10],
        fill: true,
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.15)',
        tension: 0.35
      }
    ]
  };

  serviceDemandData = {
    labels: ['Inhumación', 'Cremación', 'Traslado', 'Salón velatorio', 'Nicho'],
    datasets: [
      {
        label: 'Servicios otorgados',
        data: [22, 10, 15, 8, 6],
        backgroundColor: ['#042f2e', '#134e4a', '#115e59', '#0f766e', '#14b8a6'],
        borderRadius: 6
      }
    ]
  };

  collectionData = {
    labels: ['Confirmado', 'Pendiente'],
    datasets: [
      {
        label: 'Monto acumulado',
        data: [18540, 4280],
        backgroundColor: ['#14b8a6', '#f59e0b'],
        borderRadius: 6
      }
    ]
  };

  chartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#475569'
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#64748b'
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.15)'
        }
      },
      y: {
        ticks: {
          color: '#64748b'
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.15)'
        }
      }
    }
  };

  compactChartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#64748b'
        },
        grid: {
          display: false
        }
      },
      y: {
        ticks: {
          color: '#64748b'
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.12)'
        }
      }
    }
  };
}

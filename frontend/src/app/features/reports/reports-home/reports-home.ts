import {Component, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Card} from 'primeng/card';
import {Button} from 'primeng/button';
import {Toolbar} from 'primeng/toolbar';
import {DatePicker} from 'primeng/datepicker';
import {Select} from 'primeng/select';
import {Textarea} from 'primeng/textarea';
import {InputText} from 'primeng/inputtext';
import {AppService} from '../../../core/services/app.service';

interface ReportFilterConfig {
  key: string;
  label: string;
  type: 'date' | 'select' | 'text' | 'textarea';
  placeholder?: string;
  options?: {label: string; value: string}[];
}

interface ReportOption {
  id: string;
  name: string;
  description: string;
  outputHint: string;
  filters: ReportFilterConfig[];
}

@Component({
  selector: 'nv-reports-home',
  imports: [
    FormsModule,
    Card,
    Button,
    Toolbar,
    DatePicker,
    Select,
    Textarea,
    InputText,
  ],
  templateUrl: './reports-home.html',
})
export class ReportsHome {
  appService = inject(AppService);
  reportOptions: ReportOption[] = [
    {
      id: 'attentions-status',
      name: 'Atenciones por estado',
      description: 'Resume atenciones confirmadas, pendientes y anuladas dentro de un periodo.',
      outputHint: 'Ideal para control operativo y seguimiento de pagos.',
      filters: [
        {key: 'startDate', label: 'Fecha inicio', type: 'date'},
        {key: 'endDate', label: 'Fecha fin', type: 'date'},
        {
          key: 'status',
          label: 'Estado',
          type: 'select',
          options: [
            {label: 'Todos', value: 'all'},
            {label: 'Pendiente', value: 'pending'},
            {label: 'Confirmado', value: 'confirmed'},
            {label: 'Anulado', value: 'cancelled'},
          ]
        },
      ]
    },
    {
      id: 'revenue',
      name: 'Recaudación',
      description: 'Consolida montos confirmados y pendientes por rango de fechas.',
      outputHint: 'Útil para cierre diario, semanal o mensual.',
      filters: [
        {key: 'startDate', label: 'Fecha inicio', type: 'date'},
        {key: 'endDate', label: 'Fecha fin', type: 'date'},
        {
          key: 'paymentStatus',
          label: 'Estado de pago',
          type: 'select',
          options: [
            {label: 'Todos', value: 'all'},
            {label: 'Pendiente', value: 'pending'},
            {label: 'Confirmado', value: 'confirmed'},
          ]
        },
        {
          key: 'serviceType',
          label: 'Servicio',
          type: 'select',
          options: [
            {label: 'Todos', value: 'all'},
            {label: 'Inhumación', value: 'inhumation'},
            {label: 'Cremación', value: 'cremation'},
            {label: 'Traslado interno', value: 'transfer'},
          ]
        },
      ]
    },
    {
      id: 'services-demand',
      name: 'Servicios más otorgados',
      description: 'Ordena los servicios según volumen y frecuencia de asignación.',
      outputHint: 'Sirve para evaluar demanda y ajustar capacidad operativa.',
      filters: [
        {key: 'startDate', label: 'Fecha inicio', type: 'date'},
        {key: 'endDate', label: 'Fecha fin', type: 'date'},
        {
          key: 'serviceCategory',
          label: 'Categoría',
          type: 'select',
          options: [
            {label: 'Todas', value: 'all'},
            {label: 'Sepultura', value: 'burial'},
            {label: 'Crematorio', value: 'crematory'},
            {label: 'Logística', value: 'logistics'},
          ]
        },
      ]
    },
    {
      id: 'deceased-registry',
      name: 'Difuntos registrados',
      description: 'Lista registros del padrón según periodo y criterios documentales.',
      outputHint: 'Pensado para consultas administrativas y conciliación de padrón.',
      filters: [
        {key: 'startDate', label: 'Fecha inicio', type: 'date'},
        {key: 'endDate', label: 'Fecha fin', type: 'date'},
        {key: 'documentNumber', label: 'Documento', type: 'text', placeholder: 'Ingrese número de documento'},
        {key: 'notes', label: 'Observaciones', type: 'textarea', placeholder: 'Notas adicionales del reporte'},
      ]
    },
    {
      id: 'pending-payments',
      name: 'Pagos pendientes',
      description: 'Detecta atenciones con saldo por regularizar y sus responsables.',
      outputHint: 'Enfocado en seguimiento financiero y cobranza.',
      filters: [
        {key: 'startDate', label: 'Fecha inicio', type: 'date'},
        {key: 'endDate', label: 'Fecha fin', type: 'date'},
        {
          key: 'collector',
          label: 'Responsable',
          type: 'select',
          options: [
            {label: 'Todos', value: 'all'},
            {label: 'Caja central', value: 'cashier'},
            {label: 'Administración', value: 'admin'},
          ]
        },
      ]
    },
  ];

  selectedReport = signal<ReportOption>(this.reportOptions[0]);
  filterValues = signal<Record<string, string | Date | null>>({
    startDate: null,
    endDate: null,
    status: 'all',
    paymentStatus: 'all',
    serviceType: 'all',
    serviceCategory: 'all',
    documentNumber: '',
    notes: '',
    collector: 'all',
  });

  selectedReportName = computed(() => this.selectedReport().name);

  setSelectedReport(report: ReportOption): void {
    this.selectedReport.set(report);
  }

  updateFilter(key: string, value: string | Date | null): void {
    this.filterValues.update((current) => ({
      ...current,
      [key]: value,
    }));
  }

  clearFilters(): void {
    this.filterValues.set({
      startDate: null,
      endDate: null,
      status: 'all',
      paymentStatus: 'all',
      serviceType: 'all',
      serviceCategory: 'all',
      documentNumber: '',
      notes: '',
      collector: 'all',
    });
  }

  generateReport(): void {
    // Mock action placeholder.
  }
}

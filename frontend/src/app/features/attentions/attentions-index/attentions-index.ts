import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Paginator} from 'primeng/paginator';
import {Tag} from 'primeng/tag';
import {TableModule} from 'primeng/table';

interface AttentionRecord {
  id: number;
  recordNumber: string;
  deceasedFullName: string;
  deceasedDocument: string;
  serviceSummary: string;
  amount: string;
  status: 'Pendiente' | 'Anulado' | 'Confirmado';
  createdAt: string;
}

@Component({
  selector: 'nv-attentions-index',
  imports: [
    FormsModule,
    RouterLink,
    Card,
    Button,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    Tag,
    TableModule
  ],
  templateUrl: './attentions-index.html',
})
export class AttentionsIndex {
  searchTerm = '';
  rows = 25;
  page = 0;
  sortField: 'recordNumber' | 'deceasedFullName' | 'deceasedDocument' | 'serviceSummary' | 'amount' | 'status' | 'createdAt' = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';

  records: AttentionRecord[] = [
    {
      id: 1,
      recordNumber: 'AT-2026-0041',
      deceasedFullName: 'Carlos Alberto Rojas Mamani',
      deceasedDocument: '4587123 LP',
      serviceSummary: 'Inhumación + Traslado interno',
      amount: 'Bs 530.00',
      status: 'Pendiente',
      createdAt: '2026-04-12 10:45',
    },
    {
      id: 2,
      recordNumber: 'AT-2026-0040',
      deceasedFullName: 'Julia Elena Fernández Vargas',
      deceasedDocument: '6123456 CB',
      serviceSummary: 'Cremación',
      amount: 'Bs 780.00',
      status: 'Confirmado',
      createdAt: '2026-04-12 09:20',
    },
    {
      id: 3,
      recordNumber: 'AT-2026-0039',
      deceasedFullName: 'Marco Antonio Condori López',
      deceasedDocument: '7345128 OR',
      serviceSummary: 'Uso de salón velatorio',
      amount: 'Bs 500.00',
      status: 'Anulado',
      createdAt: '2026-04-11 16:05',
    },
    {
      id: 4,
      recordNumber: 'AT-2026-0038',
      deceasedFullName: 'Lucía Fernanda Salazar Peña',
      deceasedDocument: '8023411 SC',
      serviceSummary: 'Inhumación',
      amount: 'Bs 350.00',
      status: 'Confirmado',
      createdAt: '2026-04-11 11:40',
    },
  ];

  get filteredRecords(): AttentionRecord[] {
    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.records;
    }

    return this.records.filter((record) =>
      [
        record.recordNumber,
        record.deceasedFullName,
        record.deceasedDocument,
        record.serviceSummary,
        record.amount,
        record.status,
        record.createdAt,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  get sortedRecords(): AttentionRecord[] {
    return [...this.filteredRecords].sort((left, right) => {
      let comparison = 0;

      if (this.sortField === 'status') {
        comparison = left.status.localeCompare(right.status);
      } else {
        comparison = left[this.sortField].localeCompare(right[this.sortField]);
      }

      return this.sortDirection === 'asc' ? comparison : comparison * -1;
    });
  }

  get pagedRecords(): AttentionRecord[] {
    const offset = this.page * this.rows;
    return this.sortedRecords.slice(offset, offset + this.rows);
  }

  onSearch(value: string): void {
    this.searchTerm = value;
    this.page = 0;
  }

  onSort(field: typeof this.sortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = field === 'createdAt' ? 'desc' : 'asc';
    }

    this.page = 0;
  }

  onPageChange(event: {page?: number; rows?: number}): void {
    this.page = event.page ?? 0;
    this.rows = event.rows ?? this.rows;
  }

  sortIcon(field: typeof this.sortField): string {
    if (this.sortField !== field) {
      return 'pi pi-sort-alt text-surface-400';
    }

    return this.sortDirection === 'asc'
      ? 'pi pi-sort-amount-up-alt text-primary'
      : 'pi pi-sort-amount-down text-primary';
  }

  statusSeverity(status: AttentionRecord['status']): 'warn' | 'danger' | 'success' {
    switch (status) {
      case 'Pendiente':
        return 'warn';
      case 'Anulado':
        return 'danger';
      default:
        return 'success';
    }
  }
}

import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {InputText} from 'primeng/inputtext';
import {Paginator} from 'primeng/paginator';
import {TableModule} from 'primeng/table';

interface DeceasedRecord {
  id: number;
  paternalSurname: string;
  maternalSurname: string;
  names: string;
  documentNumber: string;
  deathDate: string;
}

@Component({
  selector: 'nv-deceased-index',
  imports: [
    FormsModule,
    RouterLink,
    Card,
    Button,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    TableModule
  ],
  templateUrl: './deceased-index.html',
})
export class DeceasedIndex {
  searchTerm = '';
  rows = 25;
  page = 0;
  sortField: 'paternalSurname' | 'maternalSurname' | 'names' | 'documentNumber' | 'deathDate' = 'paternalSurname';
  sortDirection: 'asc' | 'desc' = 'asc';
  records: DeceasedRecord[] = [
    {
      id: 1,
      paternalSurname: 'Rojas',
      maternalSurname: 'Mamani',
      names: 'Carlos Alberto',
      documentNumber: '4587123 LP',
      deathDate: '2026-03-08',
    },
    {
      id: 2,
      paternalSurname: 'Fernández',
      maternalSurname: 'Vargas',
      names: 'Julia Elena',
      documentNumber: '6123456 CB',
      deathDate: '2026-02-25',
    },
    {
      id: 3,
      paternalSurname: 'Condori',
      maternalSurname: 'López',
      names: 'Marco Antonio',
      documentNumber: '7345128 OR',
      deathDate: '2026-01-16',
    },
    {
      id: 4,
      paternalSurname: 'Salazar',
      maternalSurname: 'Peña',
      names: 'Lucía Fernanda',
      documentNumber: '8023411 SC',
      deathDate: '2025-12-30',
    },
  ];

  get filteredRecords(): DeceasedRecord[] {
    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.records;
    }

    return this.records.filter((record) =>
      [
        record.paternalSurname,
        record.maternalSurname,
        record.names,
        record.documentNumber,
        record.deathDate,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  get sortedRecords(): DeceasedRecord[] {
    return [...this.filteredRecords].sort((left, right) => {
      const comparison = left[this.sortField].localeCompare(right[this.sortField]);
      return this.sortDirection === 'asc' ? comparison : comparison * -1;
    });
  }

  get pagedRecords(): DeceasedRecord[] {
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
      this.sortDirection = 'asc';
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
}

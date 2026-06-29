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

interface ServiceCatalogRecord {
  id: number;
  code: string;
  name: string;
  category: string;
  price: string;
  active: boolean;
}

@Component({
  selector: 'nv-service-catalog-index',
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
  templateUrl: './service-catalog-index.html',
})
export class ServiceCatalogIndex {
  searchTerm = '';
  rows = 25;
  page = 0;
  sortField: 'code' | 'name' | 'category' | 'price' | 'status' = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';
  services: ServiceCatalogRecord[] = [
    {
      id: 1,
      code: 'SRV-001',
      name: 'Inhumación',
      category: 'Sepultura',
      price: 'Bs 350.00',
      active: true,
    },
    {
      id: 2,
      code: 'SRV-002',
      name: 'Cremación',
      category: 'Crematorio',
      price: 'Bs 780.00',
      active: true,
    },
    {
      id: 3,
      code: 'SRV-003',
      name: 'Traslado interno',
      category: 'Logística',
      price: 'Bs 180.00',
      active: true,
    },
    {
      id: 4,
      code: 'SRV-004',
      name: 'Uso de salón velatorio',
      category: 'Velatorio',
      price: 'Bs 500.00',
      active: false,
    },
  ];

  get filteredServices(): ServiceCatalogRecord[] {
    const search = this.searchTerm.trim().toLowerCase();

    if (!search) {
      return this.services;
    }

    return this.services.filter((service) =>
      [service.code, service.name, service.category, service.price]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  get sortedServices(): ServiceCatalogRecord[] {
    return [...this.filteredServices].sort((left, right) => {
      if (this.sortField === 'status') {
        const comparison = left.active === right.active ? 0 : left.active ? 1 : -1;
        return this.sortDirection === 'asc' ? comparison : comparison * -1;
      }

      const comparison = left[this.sortField].localeCompare(right[this.sortField]);
      return this.sortDirection === 'asc' ? comparison : comparison * -1;
    });
  }

  get pagedServices(): ServiceCatalogRecord[] {
    const offset = this.page * this.rows;
    return this.sortedServices.slice(offset, offset + this.rows);
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
      this.sortDirection = field === 'status' ? 'desc' : 'asc';
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

export interface WorkNavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

export const WORK_NAV_ITEMS: WorkNavItem[] = [
  { id: 'inbox', label: 'Bandeja de entrada', icon: 'pi pi-inbox', route: '/work/inbox' },
  { id: 'issues', label: 'Incidencias', icon: 'pi pi-list', route: '/work/issues' },
  { id: 'dashboards', label: 'Paneles', icon: 'pi pi-th-large', route: '/work/dashboards' },
  { id: 'agile', label: 'Paneles de Agile', icon: 'pi pi-objects-column', route: '/work/agile' },
  { id: 'reports', label: 'Informes', icon: 'pi pi-chart-bar', route: '/work/reports' },
  { id: 'projects', label: 'Proyectos', icon: 'pi pi-folder', route: '/work/projects' },
  { id: 'knowledge', label: 'Base de conocimiento', icon: 'pi pi-book', route: '/work/knowledge' },
  { id: 'timesheets', label: 'Partes de horas', icon: 'pi pi-clock', route: '/work/timesheets' },
  { id: 'gantt', label: 'Diagramas de Gantt', icon: 'pi pi-calendar', route: '/work/gantt' },
  { id: 'whiteboards', label: 'Pizarras', icon: 'pi pi-palette', route: '/work/whiteboards' },
];

export interface WorkSavedSearch {
  id: string;
  label: string;
  filter: 'assigned' | 'commented' | 'mentioned' | 'unassigned' | 'all';
}

export const WORK_SAVED_SEARCHES: WorkSavedSearch[] = [
  { id: 'assigned', label: 'Asignadas a mí', filter: 'assigned' },
  { id: 'commented', label: 'Comentadas por mí', filter: 'commented' },
  { id: 'mentioned', label: 'Notificadas por mí', filter: 'mentioned' },
  { id: 'unassigned', label: 'Sin asignar en proyecto', filter: 'unassigned' },
];

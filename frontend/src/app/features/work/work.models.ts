export type WorkPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkIssueType =
  | 'OPERACION'
  | 'FEATURE'
  | 'ANALISIS_UI'
  | 'UI'
  | 'ANALISIS'
  | 'DESPLIEGUE'
  | 'PRUEBAS'
  | 'CORRECCION'
  | 'MIGRACION'
  | 'QA';
export type WorkColumnId = 'registered' | 'in_assignment' | 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'closed';

export const WORK_ISSUE_TYPE_LABELS: Record<WorkIssueType, string> = {
  OPERACION: 'Operación',
  FEATURE: 'Feature',
  ANALISIS_UI: 'Análisis/UI',
  UI: 'UI',
  ANALISIS: 'Análisis',
  DESPLIEGUE: 'Despliegue',
  PRUEBAS: 'Pruebas',
  CORRECCION: 'Corrección',
  MIGRACION: 'Migración',
  QA: 'QA',
};

export const WORK_ISSUE_TYPE_OPTIONS = (Object.keys(WORK_ISSUE_TYPE_LABELS) as WorkIssueType[]).map(value => ({
  label: WORK_ISSUE_TYPE_LABELS[value],
  value,
}));

export const WORK_STATUS_LABELS: Record<WorkColumnId, string> = {
  registered: 'Registrada',
  in_assignment: 'En Asignación',
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En curso',
  review: 'En revisión',
  done: 'Hecho',
  closed: 'Cerrada',
};

export interface WorkMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  roles?: string[];
}

export interface WorkComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  publicReply?: boolean;
}

export interface WorkTimeEntry {
  id: string;
  memberId: string;
  minutes: number;
  note: string;
  loggedAt: string;
  activityType?: string;
}

export interface WorkAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface WorkCardCreateContext {
  boardId: string;
  columnId?: WorkColumnId;
  boardListId?: string | null;
  incoming?: boolean;
}

export interface WorkCard {
  id: string;
  boardId: string;
  boardListId?: string | null;
  parentIssueId?: string | null;
  issueNumber: number;
  columnId: WorkColumnId;
  title: string;
  description: string;
  priority: WorkPriority;
  assigneeId: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  trackedMinutes: number;
  attachments: WorkAttachment[];
  comments: WorkComment[];
  timeEntries: WorkTimeEntry[];
  order: number;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  completedAt?: string | null;
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  receptionChannel?: string;
  publicToken?: string;
  helpdeskRequest?: boolean;
  publicTrackingEnabled?: boolean;
  sla?: {
    firstReplyDueAt: string;
    firstReplyAt: string | null;
    resolutionDueAt: string;
    resolvedAt: string | null;
  } | null;
  startDate?: string;
  endDate?: string;
  issueType?: string | null;
  observations?: string | null;
}

export interface WorkBoard {
  id: string;
  name: string;
  description: string;
  key: string;
  accent: string;
  memberIds: string[];
  parentBoardId?: string | null;
  type: 'standard' | 'general';
  createdAt: string;
}

export interface WorkBoardList {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  columnId?: WorkColumnId;
}

export interface WorkState {
  boards: WorkBoard[];
  boardLists: WorkBoardList[];
  cards: WorkCard[];
  members: WorkMember[];
  activeTimer: WorkActiveTimer | null;
}

export interface WorkActiveTimer {
  cardId: string;
  startedAt: string;
  note: string;
}

export const WORK_COLUMNS: { id: WorkColumnId; title: string; icon: string }[] = [
  { id: 'registered', title: 'Registrada', icon: 'pi pi-inbox' },
  { id: 'in_assignment', title: 'En Asignación', icon: 'pi pi-arrows-alt' },
  { id: 'backlog', title: 'Backlog', icon: 'pi pi-inbox' },
  { id: 'todo', title: 'Por hacer', icon: 'pi pi-list' },
  { id: 'in_progress', title: 'En progreso', icon: 'pi pi-spinner' },
  { id: 'review', title: 'En revisión', icon: 'pi pi-eye' },
  { id: 'done', title: 'Hecho', icon: 'pi pi-check-circle' },
  { id: 'closed', title: 'Cerrada', icon: 'pi pi-lock' },
];

export const AGILE_COLUMNS: { id: WorkColumnId; title: string; icon: string }[] = [
  { id: 'in_assignment', title: 'Asignado', icon: 'pi pi-arrows-alt' },
  { id: 'todo', title: 'Por hacer', icon: 'pi pi-list' },
  { id: 'in_progress', title: 'En progreso', icon: 'pi pi-spinner' },
  { id: 'review', title: 'En revisión', icon: 'pi pi-eye' },
  { id: 'closed', title: 'Cerrado', icon: 'pi pi-lock' },
];

export const WORK_PRIORITIES: { value: WorkPriority; label: string; icon: string; tone: string }[] = [
  { value: 'low', label: 'Normal', icon: 'pi pi-arrow-down', tone: 'text-surface-500' },
  { value: 'medium', label: 'Normal', icon: 'pi pi-minus', tone: 'text-primary-600' },
  { value: 'high', label: 'Mayor', icon: 'pi pi-arrow-up', tone: 'text-amber-600' },
  { value: 'critical', label: 'Crítico', icon: 'pi pi-exclamation-triangle', tone: 'text-red-600' },
];

export const WORK_BOARD_ACCENTS = [
  'bg-teal-500',
  'bg-primary-500',
  'bg-cyan-600',
  'bg-emerald-600',
  'bg-sky-600',
];

const uid = () => crypto.randomUUID();

export function createDefaultWorkState(): WorkState {
  const members: WorkMember[] = [
    { id: 'm1', name: 'Pedro Condori', initials: 'PC', role: 'Administrador' },
    { id: 'm2', name: 'Ana Ríos', initials: 'AR', role: 'Desarrolladora' },
    { id: 'm3', name: 'Luis Mendoza', initials: 'LM', role: 'QA' },
    { id: 'm4', name: 'Sofía Vega', initials: 'SV', role: 'Product Owner' },
  ];

  const boards: WorkBoard[] = [
    {
      id: 'b0',
      name: 'Tablero general',
      description: '',
      key: 'GEN',
      accent: 'bg-primary-600',
      memberIds: ['m1', 'm2', 'm3', 'm4'],
      type: 'general',
      createdAt: '2026-05-01T10:00:00.000Z',
    },
    {
      id: 'b1',
      name: 'Plataforma SCAR',
      description: 'Evolución del ecosistema operativo y módulos core.',
      key: 'ARG',
      accent: 'bg-teal-500',
      memberIds: ['m1', 'm2', 'm4'],
      type: 'standard',
      createdAt: '2026-05-01T10:00:00.000Z',
    },
    {
      id: 'b2',
      name: 'Sprint actual',
      description: 'Entregables de la iteración en curso.',
      key: 'SPR',
      accent: 'bg-primary-500',
      memberIds: ['m1', 'm2', 'm3'],
      type: 'standard',
      createdAt: '2026-05-08T10:00:00.000Z',
    },
  ];

  const now = new Date().toISOString();
  const cards: WorkCard[] = [
    {
      id: 'c1',
      boardId: 'b1',
      issueNumber: 1,
      columnId: 'in_progress',
      title: 'Diseñar módulo de trabajo Kanban',
      description: 'Tablero con columnas, tarjetas arrastrables y drawer de detalle al estilo Trello/YouTrack.',
      priority: 'high',
      assigneeId: 'm2',
      dueDate: '2026-05-20',
      estimateMinutes: 480,
      trackedMinutes: 210,
      attachments: [],
      comments: [
        {
          id: 'cm1',
          authorId: 'm4',
          text: 'Priorizar drag & drop y registro de tiempo.',
          createdAt: '2026-05-14T09:00:00.000Z',
        },
      ],
      timeEntries: [
        { id: 't1', memberId: 'm2', minutes: 120, note: 'Maquetación columnas', loggedAt: '2026-05-14T14:00:00.000Z' },
        { id: 't2', memberId: 'm2', minutes: 90, note: 'Integración PrimeNG', loggedAt: '2026-05-15T11:30:00.000Z' },
      ],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c2',
      boardId: 'b1',
      issueNumber: 2,
      columnId: 'todo',
      title: 'Integrar API de usuarios',
      description: 'Conectar listado y formularios con backend real.',
      priority: 'medium',
      assigneeId: 'm2',
      dueDate: '2026-05-25',
      estimateMinutes: 360,
      trackedMinutes: 0,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c3',
      boardId: 'b1',
      issueNumber: 3,
      columnId: 'review',
      title: 'Revisar flujo de autenticación',
      description: 'Validar guards, login y persistencia de sesión.',
      priority: 'medium',
      assigneeId: 'm3',
      dueDate: '2026-05-18',
      estimateMinutes: 180,
      trackedMinutes: 175,
      attachments: [],
      comments: [],
      timeEntries: [
        { id: 't3', memberId: 'm3', minutes: 175, note: 'Pruebas E2E login', loggedAt: '2026-05-13T16:00:00.000Z' },
      ],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c4',
      boardId: 'b1',
      issueNumber: 4,
      columnId: 'backlog',
      title: 'Dashboard de métricas operativas',
      description: 'Gráficos de atenciones, servicios y cobros.',
      priority: 'low',
      assigneeId: 'm4',
      dueDate: null,
      estimateMinutes: 600,
      trackedMinutes: 0,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c5',
      boardId: 'b1',
      issueNumber: 5,
      columnId: 'done',
      title: 'Definir preset de colores teal',
      description: 'Tema PrimeNG alineado a rgb(20, 184, 166).',
      priority: 'medium',
      assigneeId: 'm1',
      dueDate: '2026-05-10',
      estimateMinutes: 120,
      trackedMinutes: 130,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c6',
      boardId: 'b2',
      issueNumber: 1,
      columnId: 'in_progress',
      title: 'Corregir validación en formulario de difuntos',
      description: 'Campos obligatorios y mensajes de error.',
      priority: 'critical',
      assigneeId: 'm3',
      dueDate: '2026-05-16',
      estimateMinutes: 240,
      trackedMinutes: 95,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'c7',
      boardId: 'b2',
      issueNumber: 2,
      columnId: 'todo',
      title: 'Exportar reportes a PDF',
      description: 'Generación desde plantillas del módulo reportes.',
      priority: 'high',
      assigneeId: 'm1',
      dueDate: '2026-05-22',
      estimateMinutes: 300,
      trackedMinutes: 0,
      attachments: [],
      comments: [],
      timeEntries: [],
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { boards, boardLists: [], cards, members, activeTimer: null };
}

export function newBoardId(): string {
  return uid();
}

export function newCardId(): string {
  return uid();
}

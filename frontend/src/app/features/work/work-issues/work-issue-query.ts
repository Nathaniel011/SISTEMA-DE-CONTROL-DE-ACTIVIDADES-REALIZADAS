import {WORK_PRIORITIES, WORK_STATUS_LABELS, WorkCard} from '../work.models';

type Attribute = 'project' | 'state' | 'assignee' | 'priority' | 'type' | 'id';
type Term = {attribute: Attribute; value: string; excluded: boolean};
export type IssueQuery = {text: string; terms: Term[]; incomplete: boolean};
type MatchContext = {key: string; projectKey: string; projectName: string; assignee: string; currentUserId: string | null};

const ALIASES: Record<string, Attribute> = {
  project: 'project', proyecto: 'project', state: 'state', estado: 'state',
  assignee: 'assignee', responsable: 'assignee', priority: 'priority', prioridad: 'priority',
  type: 'type', tipo: 'type', id: 'id', identificador: 'id',
};
const PRIORITY_ALIASES: Record<string, WorkCard['priority']> = {
  alta: 'high', alto: 'high', media: 'medium', medio: 'medium', baja: 'low', bajo: 'low',
};

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
}

export function parseIssueQuery(raw: string): IssueQuery {
  const tokens = /(?:([\p{L}]+)\s*:\s*|(#))(-?)(\{[^}]*\}|"[^"]*"|[^\s{},"]+)(?:\s*,\s*(-?)(\{[^}]*\}|"[^"]*"|[^\s{},"]+))*/uy;
  const plain: string[] = [];
  const terms: Term[] = [];
  let remaining = raw.trim();
  while (remaining) {
    tokens.lastIndex = 0;
    const match = tokens.exec(remaining);
    if (match && (match[1] ? Object.hasOwn(ALIASES, normalized(match[1])) : match[2])) {
      const values = match[0].slice(match[2] ? 1 : match[0].indexOf(':') + 1)
        .matchAll(/(-?)(\{[^}]*\}|"[^"]*"|[^\s{},"]+)/gu);
      for (const [, sign, rawValue] of values) {
        const grouped = rawValue.startsWith('{') || rawValue.startsWith('"');
        const value = normalized(grouped ? rawValue.slice(1, -1) : rawValue);
        if (!value) return {text: '', terms, incomplete: true};
        const attribute = match[1] ? ALIASES[normalized(match[1])]
          : /-\d+$/.test(value) ? 'id'
          : ['my', 'mio'].includes(value) ? 'assignee'
          : ['resolved', 'unresolved', 'abiertas', 'resueltas'].includes(value) ? 'state' : 'project';
        terms.push({attribute, value, excluded: sign === '-'});
      }
      remaining = remaining.slice(match[0].length).trimStart();
      continue;
    }
    const prefix = remaining.match(/^([\p{L}]+)\s*:/u);
    if ((prefix && Object.hasOwn(ALIASES, normalized(prefix[1]))) || remaining.startsWith('#{')) {
      return {text: '', terms, incomplete: true};
    }
    const word = remaining.match(/^\S+/)![0];
    plain.push(word);
    remaining = remaining.slice(word.length).trimStart();
  }
  return {text: terms.length ? plain.join(' ') : raw, terms, incomplete: false};
}

export function matchesIssueQuery(
  query: IssueQuery,
  card: Pick<WorkCard, 'columnId' | 'priority' | 'assigneeId' | 'issueType'>,
  context: MatchContext,
): boolean {
  if (query.incomplete) return false;
  if (!query.terms.length) return true;
  const resolved = card.columnId === 'done' || card.columnId === 'closed';
  const matches = ({attribute, value}: Term): boolean => {
    switch (attribute) {
      case 'project': return [context.projectKey, context.projectName].some(text => normalized(text) === value);
      case 'id': return normalized(context.key) === value;
      case 'state':
        if (value === 'resolved' || value === 'resueltas') return resolved;
        if (value === 'unresolved' || value === 'abiertas') return !resolved;
        return normalized(card.columnId.replaceAll('_', ' ')) === value || normalized(WORK_STATUS_LABELS[card.columnId]) === value;
      case 'assignee':
        if (['me', 'mi', 'my', 'mio'].includes(value)) return !!context.currentUserId && card.assigneeId === context.currentUserId;
        if (['unassigned', 'sin asignar'].includes(value)) return !card.assigneeId;
        return !!card.assigneeId && [context.assignee, card.assigneeId].some(text => normalized(text) === value);
      case 'priority':
        return card.priority === value || PRIORITY_ALIASES[value] === card.priority
          || normalized(WORK_PRIORITIES.find(priority => priority.value === card.priority)?.label ?? '') === value;
      case 'type': return normalized(card.issueType ?? '') === value;
    }
  };
  const positive = new Map<Attribute, boolean>();
  for (const term of query.terms) {
    if (term.excluded) {
      if (matches(term)) return false;
    } else {
      positive.set(term.attribute, positive.get(term.attribute) === true || matches(term));
    }
  }
  return [...positive.values()].every(Boolean);
}

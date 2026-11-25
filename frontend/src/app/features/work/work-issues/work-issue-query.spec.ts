import {describe, expect, it} from 'vitest';
import {matchesIssueQuery, parseIssueQuery} from './work-issue-query';

const issue = {columnId: 'in_progress', priority: 'high', assigneeId: 'current', issueType: 'Atención'} as const;
const context = {key: 'ARG-3', projectKey: 'ARG', projectName: 'Plataforma SCAR', assignee: 'Luis Mendoza', currentUserId: 'current'};

describe('consultas de incidencias', () => {
  it('conserva las búsquedas de texto', () => {
    expect(parseIssueQuery('Integrar API: Spring Boot')).toEqual({
      text: 'Integrar API: Spring Boot', terms: [], incomplete: false,
    });
  });

  it('combina filtros, texto y alias en español con tildes', () => {
    const query = parseIssueQuery('proyecto: {Plataforma SCAR} estado: {En curso} responsable: mí prioridad: alta registro');
    expect(query.text).toBe('registro');
    expect(matchesIssueQuery(query, issue, context)).toBe(true);
    expect(matchesIssueQuery(query, {...issue, assigneeId: 'other'}, context)).toBe(false);
  });

  it('acepta alternativas y aplica las exclusiones', () => {
    expect(matchesIssueQuery(parseIssueQuery('project: SPR, ARG state: -done, -closed'), issue, context)).toBe(true);
    expect(matchesIssueQuery(parseIssueQuery('#ARG-3 state: -{In Progress}'), issue, context)).toBe(false);
    expect(matchesIssueQuery(parseIssueQuery('#SPR #unresolved'), issue, context)).toBe(false);
  });

  it('no amplía resultados cuando el filtro está a medias', () => {
    const query = parseIssueQuery('state: {En curso');
    expect(query.incomplete).toBe(true);
    expect(matchesIssueQuery(query, issue, context)).toBe(false);
  });
});

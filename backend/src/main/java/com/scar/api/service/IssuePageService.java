package com.scar.api.service;

import com.scar.api.dto.IssuePageDto;
import com.scar.api.dto.IssuePageDto.Counts;
import com.scar.api.dto.IssuePageDto.Query;
import com.scar.api.dto.IssuePageDto.Row;
import com.scar.api.dto.IssuePageDto.Term;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class IssuePageService {
    private static final String OPEN = "i.column_id NOT IN ('done', 'closed')";
    private static final String RESOLVED = "i.column_id IN ('done', 'closed')";
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Map<String, String> STATES = Map.of(
        "registrada", "registered", "en asignacion", "in assignment", "por hacer", "todo",
        "en curso", "in progress", "en revision", "review", "hecho", "done", "cerrada", "closed");
    private static final Map<String, String> PRIORITIES = Map.ofEntries(
        Map.entry("alta", "high"), Map.entry("alto", "high"), Map.entry("mayor", "high"),
        Map.entry("media", "medium"), Map.entry("medio", "medium"), Map.entry("normal", "medium"),
        Map.entry("critica", "critical"), Map.entry("critico", "critical"), Map.entry("baja", "low"),
        Map.entry("bajo", "low"), Map.entry("menor", "low"));

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final PermissionService permissions;

    public IssuePageService(JdbcClient jdbc, UserRepository users, PermissionService permissions) {
        this.jdbc = jdbc;
        this.users = users;
        this.permissions = permissions;
    }

    public record BoardCount(long total, long inProgress) {}

    @Transactional(readOnly = true)
    public Map<UUID, BoardCount> counts(ScarPrincipal principal) {
        var user = users.findByIdWithRoles(principal.userId()).filter(actor -> actor.isActive())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return jdbc.sql("""
            SELECT i.project_id, count(*) total, count(*) FILTER (WHERE i.column_id IN ('in_progress', 'review')) in_progress
            FROM issues i
            WHERE (:privileged OR EXISTS (
                SELECT 1 FROM project_members pm WHERE pm.user_id = :actor AND pm.project_id = i.project_id))
              AND (:manager OR NOT i.helpdesk_request OR i.created_by_id = :actor OR i.assignee_id = :actor)
            GROUP BY i.project_id
            """).params(Map.of("actor", user.getId(), "privileged", permissions.isAdminOrChief(user),
                "manager", permissions.canAssignTasks(user)))
            .query(result -> {
                Map<UUID, BoardCount> counts = new LinkedHashMap<>();
                while (result.next()) counts.put(result.getObject("project_id", UUID.class),
                    new BoardCount(result.getLong("total"), result.getLong("in_progress")));
                return counts;
            });
    }

    @Transactional(readOnly = true)
    public IssuePageDto find(ScarPrincipal principal, Query query) {
        var user = users.findByIdWithRoles(principal.userId()).filter(actor -> actor.isActive())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("actor", user.getId());
        values.put("today", query.today() == null ? LocalDate.now() : query.today());
        values.put("size", query.size());
        values.put("requested", query.page());
        values.put("manager", permissions.canAssignTasks(user));
        List<String> filters = new ArrayList<>();
        if (!permissions.isAdminOrChief(user)) {
            filters.add("EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = :actor AND pm.project_id = i.project_id)");
        }
        filters.add("(:manager OR NOT i.helpdesk_request OR i.created_by_id = :actor OR i.assignee_id = :actor)");
        if (query.projects() != null) {
            if (query.projects().isEmpty()) filters.add("FALSE");
            else {
                values.put("projects", query.projects());
                filters.add("i.project_id IN (:projects)");
            }
        }
        if (query.text() != null && !query.text().isBlank()) {
            values.put("text", query.text().strip());
            filters.add("""
                (position(lower(:text) in lower(i.title)) > 0 OR position(lower(:text) in lower(COALESCE(i.description,''))) > 0
                 OR position(lower(:text) in lower(p.key_code || '-' || i.issue_number)) > 0)
                """);
        }
        filter(filters, values, "member", "i.assignee_id = :member", query.member());
        filter(filters, values, "status", "i.column_id = :status", query.status());
        filter(filters, values, "priority", "(i.priority = :priority OR (:priority = 'medium' AND i.priority = 'low'))", query.priority());
        filter(filters, values, "createdFrom", "i.created_at >= :createdFrom",
            query.createdFrom() == null ? null : query.createdFrom().atStartOfDay().atOffset(ZoneOffset.UTC));
        filter(filters, values, "createdTo", "i.created_at < :createdTo",
            query.createdTo() == null ? null : query.createdTo().plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC));
        switch (Objects.toString(query.group(), "")) {
            case "open" -> filters.add(OPEN);
            case "closed" -> filters.add(RESOLVED);
            case "progress" -> filters.add("i.column_id IN ('in_progress', 'review')");
            default -> {}
        }
        if ("commented".equals(query.activity())) {
            filters.add("EXISTS (SELECT 1 FROM issue_comments c WHERE c.issue_id = i.id AND c.author_id = :actor)");
        } else if ("mentioned".equals(query.activity())) {
            filter(filters, values, "mention",
                "EXISTS (SELECT 1 FROM issue_comments c WHERE c.issue_id = i.id AND position(:mention in c.text) > 0)", "@" + user.getUsername());
        }
        Map<String, List<String>> alternatives = new LinkedHashMap<>();
        int index = 0;
        for (Term term : query.terms() == null ? List.<Term>of() : query.terms()) {
            String condition = termCondition(term, "t" + index++, values);
            if (term.excluded()) filters.add("NOT COALESCE((" + condition + "), FALSE)");
            else alternatives.computeIfAbsent(term.attribute(), ignored -> new ArrayList<>()).add(condition);
        }
        alternatives.values().forEach(conditions -> filters.add("(" + String.join(" OR ", conditions) + ")"));
        String scope = switch (Objects.toString(query.scope(), "")) {
            case "assigned" -> "assigned";
            case "unassigned" -> "unassigned";
            case "overdue" -> "overdue";
            default -> "TRUE";
        };
        String ordering = switch (Objects.toString(query.sort(), "")) {
            case "key" -> "f.key_code, f.issue_number, f.id";
            case "due" -> "f.due_date NULLS LAST, f.key_code, f.issue_number, f.id";
            default -> "f.updated_at DESC, f.key_code, f.issue_number, f.id";
        };
        String statement = """
            WITH filtered AS MATERIALIZED (
                SELECT i.id, i.updated_at, i.due_date, i.issue_number, p.key_code,
                    COALESCE(i.assignee_id = :actor, FALSE) assigned, i.assignee_id IS NULL unassigned,
                    COALESCE(i.due_date < :today AND i.column_id NOT IN ('done', 'closed'), FALSE) overdue
                FROM issues i JOIN projects p ON p.id = i.project_id
                LEFT JOIN users assignee ON assignee.id = i.assignee_id
                WHERE %s
            ), counts AS (
                SELECT count(*) AS all_count, count(*) FILTER (WHERE assigned) AS assigned_count,
                    count(*) FILTER (WHERE overdue) AS overdue_count, count(*) FILTER (WHERE unassigned) AS unassigned_count,
                    count(*) FILTER (WHERE %s) AS total_count FROM filtered
            ), page_window AS (
                SELECT *, LEAST(:requested, GREATEST(1, (total_count + :size - 1) / :size)) AS actual_page FROM counts
            )
            SELECT w.*, i.id, i.project_id, i.board_list_id, i.issue_number, i.column_id, i.title, i.priority,
                i.assignee_id, i.due_date, i.updated_at,
                COALESCE(:manager OR i.created_by_id = :actor OR i.assignee_id = :actor, FALSE) AS can_edit
            FROM page_window w LEFT JOIN LATERAL (
                SELECT f.id, f.updated_at, f.due_date, f.key_code, f.issue_number FROM filtered f WHERE %s
                ORDER BY %s LIMIT :size OFFSET (SELECT (actual_page - 1) * :size FROM page_window)
            ) f ON TRUE LEFT JOIN issues i ON i.id = f.id
            ORDER BY %s
            """.formatted(String.join(" AND ", filters), scope, scope, ordering, ordering);
        return jdbc.sql(statement).params(values).query(result -> {
            result.next();
            Counts counts = new Counts(result.getLong("all_count"), result.getLong("assigned_count"),
                result.getLong("overdue_count"), result.getLong("unassigned_count"));
            long total = result.getLong("total_count");
            int page = result.getInt("actual_page");
            List<Row> items = new ArrayList<>();
            do {
                UUID id = result.getObject("id", UUID.class);
                if (id != null) items.add(new Row(id, result.getObject("project_id", UUID.class), result.getObject("board_list_id", UUID.class),
                    result.getInt("issue_number"), result.getString("column_id"), result.getString("title"), result.getString("priority"),
                    result.getObject("assignee_id", UUID.class), result.getObject("due_date", LocalDate.class),
                    result.getObject("updated_at", java.time.OffsetDateTime.class).toInstant().toString(), result.getBoolean("can_edit")));
            } while (result.next());
            return new IssuePageDto(items, counts, total, page);
        });
    }

    private static void filter(List<String> filters, Map<String, Object> params, String key, String predicate, Object value) {
        if (value != null && !(value instanceof String text && text.isBlank())) {
            params.put(key, value);
            filters.add(predicate);
        }
    }

    private static String termCondition(Term term, String key, Map<String, Object> params) {
        String value = DIACRITICS.matcher(Normalizer.normalize(term.value().strip(), Normalizer.Form.NFD))
            .replaceAll("").toLowerCase(Locale.ROOT);
        String param = ":" + key;
        return switch (term.attribute()) {
            case "state" -> {
                if (List.of("resolved", "resueltas").contains(value)) yield RESOLVED;
                if (List.of("unresolved", "abiertas").contains(value)) yield OPEN;
                params.put(key, STATES.getOrDefault(value, value));
                yield "replace(i.column_id, '_', ' ') = " + param;
            }
            case "assignee" -> {
                if (List.of("me", "mi", "my", "mio").contains(value)) yield "i.assignee_id = :actor";
                if (List.of("unassigned", "sin asignar").contains(value)) yield "i.assignee_id IS NULL";
                params.put(key, value);
                yield "(" + spanish("assignee.full_name") + " = " + param + " OR i.assignee_id::text = " + param + ")";
            }
            case "priority" -> {
                params.put(key, PRIORITIES.getOrDefault(value, value));
                yield "i.priority = " + param;
            }
            case "project" -> {
                params.put(key, value);
                yield "(lower(p.key_code) = " + param + " OR " + spanish("CASE p.type WHEN 'GENERAL' THEN 'Recepción de solicitudes' ELSE p.name END") + " = " + param + ")";
            }
            case "type" -> {
                params.put(key, value);
                yield spanish("i.issue_type") + " = " + param;
            }
            case "id" -> {
                params.put(key, value);
                yield "lower(p.key_code || '-' || i.issue_number) = " + param;
            }
            default -> "FALSE";
        };
    }

    private static String spanish(String column) {
        return "translate(lower(" + column + "), 'áéíóúüñ', 'aeiouun')";
    }
}

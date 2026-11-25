package com.scar.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.IssueColumn;
import com.scar.api.domain.enums.ProjectType;
import com.scar.api.dto.ProjectConfigurationDto.*;
import com.scar.api.dto.ProjectConfigurationDto;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class ProjectConfigurationService {
    private static final TypeReference<List<String>> OPTIONS = new TypeReference<>() {};
    private static final TypeReference<List<Transition>> TRANSITIONS = new TypeReference<>() {};
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final PermissionService permissions;
    private final ActivityLogService activity;

    public ProjectConfigurationService(JdbcClient jdbc, ObjectMapper json, ProjectRepository projects,
        UserRepository users, PermissionService permissions, ActivityLogService activity) {
        this.jdbc = jdbc;
        this.json = json;
        this.projects = projects;
        this.users = users;
        this.permissions = permissions;
        this.activity = activity;
    }

    @Transactional(readOnly = true)
    public ProjectConfigurationDto configuration(ScarPrincipal principal, UUID id) {
        User user = user(principal);
        Project project = project(id, user);
        boolean canManage = project.getType() == ProjectType.STANDARD && permissions.isAdminOrChief(user);
        return new ProjectConfigurationDto(fields(id, canManage), workflow(id), canManage);
    }

    @Transactional
    public Field addField(ScarPrincipal principal, UUID projectId, FieldDraft draft) {
        requireManage(principal, projectId);
        if (fields(projectId, true).size() >= 50) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El proyecto alcanzó el límite de campos");
        }
        String name = draft.name().strip();
        List<String> options = draft.options() == null ? List.of() : draft.options().stream().map(String::strip).toList();
        if (draft.kind() == Kind.enumeration && (options.isEmpty() || options.stream().distinct().count() != options.size())
            || draft.kind() != Kind.enumeration && !options.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Revisa las opciones del campo");
        }
        UUID id = UUID.randomUUID();
        try {
            jdbc.sql("""
                INSERT INTO project_issue_fields (id, project_id, name, name_key, kind, options)
                VALUES (:id, :project, :name, :key, :kind, CAST(:options AS jsonb))
                """).param("id", id).param("project", projectId).param("name", name)
                .param("key", name.toLowerCase(Locale.ROOT)).param("kind", draft.kind().name())
                .param("options", write(options)).update();
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El proyecto ya tiene un campo con ese nombre");
        }
        return new Field(id, name, draft.kind(), options, false);
    }

    @Transactional
    public void archiveField(ScarPrincipal principal, UUID projectId, UUID fieldId, boolean archived) {
        requireManage(principal, projectId);
        int updated = jdbc.sql("UPDATE project_issue_fields SET archived = :archived WHERE project_id = :project AND id = :id")
            .param("project", projectId).param("id", fieldId).param("archived", archived).update();
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    @Transactional
    public void saveWorkflow(ScarPrincipal principal, UUID projectId, List<Transition> transitions) {
        requireManage(principal, projectId);
        if (transitions == null) {
            jdbc.sql("DELETE FROM project_workflows WHERE project_id = :project").param("project", projectId).update();
            return;
        }
        if (transitions.stream().anyMatch(rule -> rule.from() == rule.to())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Selecciona estados distintos");
        }
        jdbc.sql("""
            INSERT INTO project_workflows (project_id, transitions) VALUES (:project, CAST(:transitions AS jsonb))
            ON CONFLICT (project_id) DO UPDATE SET transitions = EXCLUDED.transitions
            """).param("project", projectId).param("transitions", write(transitions.stream().distinct().toList())).update();
    }

    public void requireTransition(UUID projectId, IssueColumn from, IssueColumn to) {
        if (from == to) return;
        List<Transition> restrictions = workflow(projectId);
        if (restrictions != null && !restrictions.contains(new Transition(from, to))) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El flujo del proyecto no permite este cambio de estado");
        }
    }

    public Map<String, List<Transition>> workflows(Set<UUID> projects) {
        Map<String, List<Transition>> result = new HashMap<>();
        if (projects.isEmpty()) return result;
        jdbc.sql("SELECT project_id, transitions::text AS transitions FROM project_workflows WHERE project_id IN (:ids)")
            .param("ids", projects).query(row -> {
                result.put(row.getString("project_id"), read(row.getString("transitions"), TRANSITIONS));
            });
        return result;
    }

    private List<Transition> workflow(UUID projectId) {
        return jdbc.sql("SELECT transitions::text FROM project_workflows WHERE project_id = :project")
            .param("project", projectId).query(String.class).optional().map(value -> read(value, TRANSITIONS)).orElse(null);
    }

    public List<FieldValue> fieldValues(Issue issue) {
        return jdbc.sql("""
            SELECT f.id, f.name, f.kind, f.options::text AS options, f.archived, v.field_value
            FROM project_issue_fields f
            LEFT JOIN issue_field_values v ON f.id = v.field_id AND v.issue_id = :issue
            WHERE f.project_id = :project AND NOT f.archived
            ORDER BY f.name_key, f.id
            """).param("project", issue.getProject().getId()).param("issue", issue.getId())
            .query((row, index) -> new FieldValue(new Field(row.getObject("id", UUID.class), row.getString("name"),
                Kind.valueOf(row.getString("kind")), read(row.getString("options"), OPTIONS), row.getBoolean("archived")),
                row.getString("field_value"))).list();
    }

    public void saveFieldValues(Issue issue, User actor, Map<UUID, String> supplied, boolean audit) {
        if (supplied == null || supplied.isEmpty()) return;
        if (actor == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Map<UUID, FieldValue> current = new HashMap<>();
        for (FieldValue value : fieldValues(issue)) current.put(value.field().id(), value);
        boolean changed = false;
        for (var entry : supplied.entrySet()) {
            FieldValue previous = current.get(entry.getKey());
            if (previous == null) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El campo no está activo en este proyecto");
            }
            String value = normalizedValue(previous.field(), entry.getValue());
            if (Objects.equals(previous.value(), value)) continue;
            if (value == null) {
                jdbc.sql("DELETE FROM issue_field_values WHERE issue_id = :issue AND field_id = :field")
                    .param("issue", issue.getId()).param("field", entry.getKey()).update();
            } else {
                jdbc.sql("""
                    INSERT INTO issue_field_values (issue_id, field_id, field_value) VALUES (:issue, :field, :value)
                    ON CONFLICT (issue_id, field_id) DO UPDATE SET field_value = EXCLUDED.field_value
                    """).param("issue", issue.getId()).param("field", entry.getKey()).param("value", value).update();
            }
            changed = true;
        }
        if (changed && audit) activity.log(issue, actor, "custom_fields", null, "Campos actualizados");
    }

    private String normalizedValue(Field field, String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.strip();
        try {
            return switch (field.kind()) {
                case text -> value;
                case integer -> Integer.toString(Integer.parseInt(value));
                case date -> {
                    LocalDate date = LocalDate.parse(value);
                    if (date.getYear() < 1 || date.getYear() > 9999) throw new IllegalArgumentException();
                    yield date.toString();
                }
                case booleanValue -> {
                    if (!value.equals("true") && !value.equals("false")) throw new IllegalArgumentException();
                    yield value;
                }
                case enumeration -> {
                    if (!field.options().contains(value)) throw new IllegalArgumentException();
                    yield value;
                }
            };
        } catch (IllegalArgumentException | DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Valor no válido para " + field.name());
        }
    }

    private List<Field> fields(UUID projectId, boolean includeArchived) {
        return jdbc.sql("""
            SELECT id, name, kind, options::text AS options, archived FROM project_issue_fields
            WHERE project_id = :project AND (:includeArchived OR NOT archived) ORDER BY name_key, id
            """).param("project", projectId).param("includeArchived", includeArchived)
            .query((row, index) -> new Field(row.getObject("id", UUID.class), row.getString("name"),
                Kind.valueOf(row.getString("kind")), read(row.getString("options"), OPTIONS), row.getBoolean("archived"))).list();
    }

    private Project project(UUID id, User user) {
        Project project = projects.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissions.requireAccessProject(user, project);
        return project;
    }

    private User user(ScarPrincipal principal) {
        return users.findByIdWithRoles(principal.userId()).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private void requireManage(ScarPrincipal principal, UUID id) {
        User user = user(principal);
        if (!permissions.isAdminOrChief(user)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Project project = projects.findByIdForUpdate(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (project.getType() != ProjectType.STANDARD) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    private <T> T read(String value, TypeReference<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Configuración del proyecto inválida", e);
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo guardar la configuración del proyecto", e);
        }
    }
}

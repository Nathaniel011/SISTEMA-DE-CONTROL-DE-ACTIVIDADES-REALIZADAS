package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.IssueDependency;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.ProjectType;
import com.scar.api.dto.GanttDto;
import com.scar.api.dto.GanttPlanDto;
import com.scar.api.dto.GanttPlanDto.Candidate;
import com.scar.api.dto.GanttPlanDto.Draft;
import com.scar.api.dto.GanttPlanDto.TaskChange;
import com.scar.api.repository.IssueDependencyRepository;
import com.scar.api.repository.IssueRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GanttPlanService {
    private final JdbcClient jdbc;
    private final ProjectRepository projects;
    private final IssueRepository issues;
    private final UserRepository users;
    private final IssueDependencyRepository dependencies;
    private final PermissionService permissions;
    private final WorkService work;

    public GanttPlanService(JdbcClient jdbc, ProjectRepository projects, IssueRepository issues, UserRepository users,
        IssueDependencyRepository dependencies, PermissionService permissions, WorkService work) {
        this.jdbc = jdbc;
        this.projects = projects;
        this.issues = issues;
        this.users = users;
        this.dependencies = dependencies;
        this.permissions = permissions;
        this.work = work;
    }

    @Transactional(readOnly = true)
    public List<GanttPlanDto> list(ScarPrincipal principal) {
        User user = activeUser(principal);
        Set<UUID> accessible = accessibleProjects(user, projects.findAllWithMembers());
        return jdbc.sql("""
            SELECT * FROM gantt_plans WHERE owner_id = :user OR shared ORDER BY lower(name), id
            """).param("user", user.getId()).query(this::readPlan).list().stream()
            .map(plan -> dto(plan, user, projectIds(plan.id())))
            .filter(plan -> !plan.projectIds().isEmpty() && accessible.containsAll(plan.projectIds()))
            .toList();
    }

    @Transactional
    public GanttPlanDto save(ScarPrincipal principal, UUID id, Draft draft) {
        User user = activeUser(principal);
        boolean creating = id == null;
        UUID planId = creating ? UUID.randomUUID() : id;
        if (draft.startDate().getYear() < 1900 || draft.startDate().getYear() > 2190) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fecha inicial fuera del intervalo admitido");
        }
        List<UUID> selected = new ArrayList<>(new LinkedHashSet<>(draft.projectIds()));
        if (!accessibleProjects(user, projects.findAllById(selected)).containsAll(selected)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Un proyecto seleccionado no está disponible");
        }
        if (creating) {
            jdbc.sql("SELECT id FROM users WHERE id = :user FOR UPDATE").param("user", user.getId()).query(UUID.class).single();
            if (jdbc.sql("SELECT COUNT(*) FROM gantt_plans WHERE owner_id = :user").param("user", user.getId())
                .query(Long.class).single() >= 30) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Alcanzaste el límite de diagramas");
            }
        } else {
            Plan current = requirePlan(user, id, true, true);
            if (current.syncIssueDates() != draft.syncIssueDates()) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La fuente de fechas se elige al crear el diagrama");
            }
        }
        String sql = creating ? """
            INSERT INTO gantt_plans (id, owner_id, name, start_date, capacity, assignee_capacity, workdays_only, sync_issue_dates, shared)
            VALUES (:id, :owner, :name, :start, :capacity, :person, :weekdays, :sync, :shared)
            """ : """
            UPDATE gantt_plans SET name = :name, start_date = :start, capacity = :capacity, assignee_capacity = :person,
               workdays_only = :weekdays, sync_issue_dates = :sync, shared = :shared WHERE id = :id AND owner_id = :owner
            """;
        jdbc.sql(sql).param("id", planId).param("owner", user.getId()).param("name", draft.name().strip())
            .param("start", draft.startDate()).param("capacity", draft.capacity(), java.sql.Types.INTEGER)
            .param("person", draft.assigneeCapacity(), java.sql.Types.INTEGER).param("weekdays", draft.workdaysOnly())
            .param("sync", draft.syncIssueDates()).param("shared", draft.shared()).update();
        jdbc.sql("DELETE FROM gantt_plan_projects WHERE plan_id = :id").param("id", planId).update();
        for (UUID projectId : selected) {
            jdbc.sql("INSERT INTO gantt_plan_projects (plan_id, project_id) VALUES (:id, :project)")
                .param("id", planId).param("project", projectId).update();
        }
        if (!creating) {
            jdbc.sql("""
                DELETE FROM gantt_plan_items item USING issues issue
                WHERE item.plan_id = :id AND issue.id = item.issue_id AND issue.project_id NOT IN (:projects)
                """).param("id", planId).param("projects", selected).update();
        }
        return new GanttPlanDto(planId, draft.name().strip(), selected, draft.startDate(), draft.capacity(),
            draft.assigneeCapacity(), draft.workdaysOnly(), draft.syncIssueDates(), draft.shared(), true);
    }

    @Transactional
    public void delete(ScarPrincipal principal, UUID id) {
        jdbc.sql("DELETE FROM gantt_plans WHERE id = :id AND owner_id = :owner")
            .param("id", id).param("owner", principal.userId()).update();
    }

    @Transactional(readOnly = true)
    public GanttDto chart(ScarPrincipal principal, UUID id) {
        User user = activeUser(principal);
        Plan plan = requirePlan(user, id, false, false);
        return chart(plan, user);
    }

    @Transactional(readOnly = true)
    public List<Candidate> candidates(ScarPrincipal principal, UUID id, String query) {
        User user = activeUser(principal);
        requirePlan(user, id, true, false);
        List<UUID> projectIds = projectIds(id);
        String text = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        return issues.findByProjectIdIn(projectIds).stream()
            .filter(issue -> permissions.canReadProjectIssue(user, issue))
            .map(issue -> new Candidate(issue.getId(), issueKey(issue), issue.getTitle(), issue.getProject().getId()))
            .filter(candidate -> candidate.key().toLowerCase(Locale.ROOT).contains(text)
                || candidate.title().toLowerCase(Locale.ROOT).contains(text))
            .sorted(Comparator.comparing(Candidate::key))
            .limit(100).toList();
    }

    @Transactional
    public GanttDto select(ScarPrincipal principal, UUID id, List<UUID> issueIds) {
        User user = activeUser(principal);
        Plan plan = requirePlan(user, id, true, true);
        List<UUID> ordered = new ArrayList<>(new LinkedHashSet<>(issueIds));
        Set<UUID> scope = new HashSet<>(projectIds(id));
        Map<UUID, Issue> selected = byId(issues.findAllById(ordered));
        if (ordered.stream().anyMatch(issueId -> !visible(user, scope, selected.get(issueId)))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Una incidencia no está disponible en el diagrama");
        }
        if (ordered.isEmpty()) {
            jdbc.sql("DELETE FROM gantt_plan_items WHERE plan_id = :id").param("id", id).update();
        } else {
            jdbc.sql("DELETE FROM gantt_plan_items WHERE plan_id = :id AND issue_id NOT IN (:issues)")
                .param("id", id).param("issues", ordered).update();
        }
        for (int position = 0; position < ordered.size(); position++) {
            saveItem(id, selected.get(ordered.get(position)), position);
        }
        return chart(plan, user);
    }

    @Transactional
    public GanttDto add(ScarPrincipal principal, UUID id, UUID issueId) {
        User user = activeUser(principal);
        Plan plan = requirePlan(user, id, true, true);
        Issue issue = issues.findById(issueId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!visible(user, new HashSet<>(projectIds(id)), issue)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Map<UUID, Item> current = items(id);
        if (!current.containsKey(issueId)) {
            if (current.size() >= 250) throw new ResponseStatusException(HttpStatus.CONFLICT, "El diagrama alcanzó el límite de incidencias");
            int position = jdbc.sql("SELECT COALESCE(MAX(position) + 1, 0) FROM gantt_plan_items WHERE plan_id = :plan")
                .param("plan", id).query(Integer.class).single();
            saveItem(id, issue, position);
        }
        return chart(plan, user);
    }

    private void saveItem(UUID plan, Issue issue, int position) {
        jdbc.sql("""
            INSERT INTO gantt_plan_items (plan_id, issue_id, position, start_date, end_date, estimate_minutes, pinned)
            VALUES (:plan, :issue, :position, :start, :end, :estimate, :pinned)
            ON CONFLICT (plan_id, issue_id) DO UPDATE SET position = EXCLUDED.position
            """).param("plan", plan).param("issue", issue.getId()).param("position", position)
            .param("start", issue.getStartDate(), java.sql.Types.DATE).param("end", work.ganttEnd(issue), java.sql.Types.DATE)
            .param("estimate", issue.getEstimateMinutes(), java.sql.Types.INTEGER).param("pinned", issue.isGanttPinned()).update();
    }

    @Transactional
    public GanttDto updateTask(ScarPrincipal principal, UUID id, UUID issueId, TaskChange change) {
        User user = activeUser(principal);
        Plan plan = requirePlan(user, id, false, true);
        WorkService.validateGanttDates(change.start(), change.end());
        if (!items(id).containsKey(issueId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Issue issue = issues.findByIdForUpdate(issueId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!visible(user, new HashSet<>(projectIds(id)), issue)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        permissions.requireUpdateIssue(user, issue, null);
        writeSchedule(plan, issue, user, change.start(), change.end(), change.estimateMinutes(), change.pinned());
        return chart(plan, user);
    }

    @Transactional
    public GanttDto recalculate(ScarPrincipal principal, UUID id) {
        User user = activeUser(principal);
        Plan plan = requirePlan(user, id, true, true);
        Map<UUID, Item> items = items(id);
        if (items.isEmpty()) return chart(plan, user);
        Set<UUID> scope = new HashSet<>(projectIds(id));
        Map<UUID, Issue> locked = byId(issues.findAllForUpdate(items.keySet()));
        List<GanttScheduler.Task> tasks = items.values().stream()
            .filter(item -> visible(user, scope, locked.get(item.id())))
            .map(item -> task(plan, locked.get(item.id()), item))
            .toList();
        Map<UUID, GanttScheduler.Window> windows = work.scheduleGantt(tasks, dependencies.findByProjectIdIn(scope),
            new GanttScheduler.Options(plan.startDate(), plan.capacity(), plan.assigneeCapacity(), plan.workdaysOnly()));
        for (GanttScheduler.Task task : tasks) {
            if (task.pinned()) continue;
            Issue issue = locked.get(task.id());
            permissions.requireUpdateIssue(user, issue, null);
            GanttScheduler.Window window = windows.get(task.id());
            if (!Objects.equals(task.start(), window.start()) || !Objects.equals(task.end(), window.end())) {
                writeSchedule(plan, issue, user, window.start(), window.end(), task.estimate(), false);
            }
        }
        return chart(plan, user);
    }

    @Transactional(readOnly = true)
    public void requireRecalculationAccess(ScarPrincipal principal, UUID id) {
        requirePlan(activeUser(principal), id, true, false);
    }

    private void writeSchedule(Plan plan, Issue issue, User user, LocalDate start, LocalDate end, Integer estimate, boolean pinned) {
        if (plan.syncIssueDates()) {
            work.applyGanttSchedule(issue, user, start, end, estimate, pinned);
        } else {
            jdbc.sql("""
                UPDATE gantt_plan_items SET start_date = :start, end_date = :end, estimate_minutes = :estimate, pinned = :pinned
                WHERE plan_id = :plan AND issue_id = :issue
                """).param("plan", plan.id()).param("issue", issue.getId())
                .param("start", start, java.sql.Types.DATE).param("end", end, java.sql.Types.DATE)
                .param("estimate", estimate, java.sql.Types.INTEGER).param("pinned", pinned && start != null).update();
        }
    }

    private GanttDto chart(Plan plan, User user) {
        Map<UUID, Item> items = items(plan.id());
        Set<UUID> scope = new HashSet<>(projectIds(plan.id()));
        Map<UUID, Issue> visible = byId(issues.findAllById(items.keySet()).stream()
            .filter(issue -> visible(user, scope, issue)).toList());
        Map<UUID, List<Issue>> children = new HashMap<>();
        List<Issue> roots = new ArrayList<>();
        for (UUID id : items.keySet()) {
            Issue issue = visible.get(id);
            if (issue == null) continue;
            if (issue.getParentIssue() != null && visible.containsKey(issue.getParentIssue().getId())) {
                children.computeIfAbsent(issue.getParentIssue().getId(), key -> new ArrayList<>()).add(issue);
            } else {
                roots.add(issue);
            }
        }
        List<GanttDto.GanttTaskDto> rows = new ArrayList<>();
        Set<UUID> emitted = new HashSet<>();
        for (Issue issue : roots) append(rows, emitted, issue, null, children, items, plan, user);
        for (UUID id : items.keySet()) {
            Issue issue = visible.get(id);
            if (issue != null && !emitted.contains(id)) append(rows, emitted, issue, null, children, items, plan, user);
        }
        List<GanttDto.GanttLinkDto> links = visible.isEmpty() ? List.of() : dependencies.findByProjectIdIn(scope).stream()
            .filter(link -> visible.containsKey(link.getIssue().getId()) && visible.containsKey(link.getDependsOnIssue().getId()))
            .map(this::linkDto).toList();
        LocalDate end = rows.stream().map(GanttDto.GanttTaskDto::end).filter(Objects::nonNull).map(LocalDate::parse)
            .max(LocalDate::compareTo).filter(date -> !date.isBefore(plan.startDate())).orElse(plan.startDate());
        return new GanttDto(plan.startDate().toString(), end.toString(), (ChronoUnit.DAYS.between(plan.startDate(), end) + 1) + " d",
            true, rows, links);
    }

    private void append(List<GanttDto.GanttTaskDto> rows, Set<UUID> emitted, Issue issue, String parent,
        Map<UUID, List<Issue>> children, Map<UUID, Item> items, Plan plan, User user) {
        if (!emitted.add(issue.getId())) return;
        List<Issue> descendants = children.getOrDefault(issue.getId(), List.of());
        GanttScheduler.Task task = task(plan, issue, items.get(issue.getId()));
        rows.add(work.ganttTask(issue, user, !descendants.isEmpty(), parent, task.start(), task.end(), task.estimate(), task.pinned()));
        for (Issue child : descendants) append(rows, emitted, child, issue.getId().toString(), children, items, plan, user);
    }

    private GanttScheduler.Task task(Plan plan, Issue issue, Item item) {
        return plan.syncIssueDates()
            ? work.ganttScheduleTask(issue, issue.getStartDate(), work.ganttEnd(issue), issue.getEstimateMinutes(), issue.isGanttPinned())
            : work.ganttScheduleTask(issue, item.start(), item.end(), item.estimate(), item.pinned());
    }

    private boolean visible(User user, Set<UUID> projectIds, Issue issue) {
        return issue != null && projectIds.contains(issue.getProject().getId()) && permissions.canReadProjectIssue(user, issue);
    }

    private Plan requirePlan(User user, UUID id, boolean ownerOnly, boolean lock) {
        String sql = "SELECT * FROM gantt_plans WHERE id = :id AND (owner_id = :owner OR shared)" + (lock ? " FOR UPDATE" : "");
        Plan plan = jdbc.sql(sql).param("id", id).param("owner", user.getId()).query(this::readPlan).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<UUID> selected = projectIds(id);
        if (selected.isEmpty() || !accessibleProjects(user, projects.findAllById(selected)).containsAll(selected)
            || (ownerOnly && !user.getId().equals(plan.owner()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El diagrama no está disponible para esta cuenta");
        }
        return plan;
    }

    private List<UUID> projectIds(UUID id) {
        return jdbc.sql("SELECT project_id FROM gantt_plan_projects WHERE plan_id = :id ORDER BY project_id")
            .param("id", id).query(UUID.class).list();
    }

    private Map<UUID, Item> items(UUID id) {
        return jdbc.sql("""
            SELECT issue_id, start_date, end_date, estimate_minutes, pinned FROM gantt_plan_items
            WHERE plan_id = :id ORDER BY position, issue_id
            """).param("id", id).query((row, index) -> new Item(row.getObject("issue_id", UUID.class),
                row.getObject("start_date", LocalDate.class), row.getObject("end_date", LocalDate.class),
                row.getObject("estimate_minutes", Integer.class), row.getBoolean("pinned"))).list().stream()
            .collect(Collectors.toMap(Item::id, item -> item, (first, second) -> first, java.util.LinkedHashMap::new));
    }

    private Set<UUID> accessibleProjects(User user, List<Project> candidates) {
        return candidates.stream().filter(project -> project.getType() == ProjectType.STANDARD && permissions.canAccessProject(user, project))
            .map(Project::getId).collect(Collectors.toSet());
    }

    private Map<UUID, Issue> byId(List<Issue> issues) { return issues.stream().collect(Collectors.toMap(Issue::getId, issue -> issue)); }

    private User activeUser(ScarPrincipal principal) {
        return users.findByIdWithRoles(principal.userId()).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private GanttPlanDto dto(Plan plan, User user, List<UUID> projectIds) {
        return new GanttPlanDto(plan.id(), plan.name(), projectIds, plan.startDate(), plan.capacity(),
            plan.assigneeCapacity(), plan.workdaysOnly(), plan.syncIssueDates(), plan.shared(), user.getId().equals(plan.owner()));
    }

    private Plan readPlan(ResultSet row, int index) throws SQLException {
        return new Plan(row.getObject("id", UUID.class), row.getObject("owner_id", UUID.class), row.getString("name"),
            row.getObject("start_date", LocalDate.class), row.getObject("capacity", Integer.class), row.getObject("assignee_capacity", Integer.class),
            row.getBoolean("workdays_only"), row.getBoolean("sync_issue_dates"), row.getBoolean("shared"));
    }

    private GanttDto.GanttLinkDto linkDto(IssueDependency link) {
        return new GanttDto.GanttLinkDto(link.getId().toString(), link.getDependsOnIssue().getId().toString(),
            link.getIssue().getId().toString(), link.getDependencyType().name());
    }

    private String issueKey(Issue issue) { return issue.getProject().getKeyCode() + "-" + issue.getIssueNumber(); }

    private record Plan(UUID id, UUID owner, String name, LocalDate startDate, Integer capacity, Integer assigneeCapacity,
        boolean workdaysOnly, boolean syncIssueDates, boolean shared) {}
    private record Item(UUID id, LocalDate start, LocalDate end, Integer estimate, boolean pinned) {}
}

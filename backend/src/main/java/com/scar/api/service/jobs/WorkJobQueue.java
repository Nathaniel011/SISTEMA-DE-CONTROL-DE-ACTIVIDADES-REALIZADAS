package com.scar.api.service.jobs;

import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.GanttPlanService;
import com.scar.api.service.WorkService;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkJobQueue {
    public enum Kind { GANTT_PLAN, GANTT_PROJECT, WEEKLY_EXPORT }
    public record Status(UUID id, String status, Integer failureStatus) {}
    record Claim(UUID id, UUID owner, Kind kind, UUID target, int attempt) {}
    public record FileResult(byte[] bytes, String fileName) {}

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final WorkService work;
    private final GanttPlanService plans;

    public WorkJobQueue(JdbcClient jdbc, UserRepository users, WorkService work, GanttPlanService plans) {
        this.jdbc = jdbc;
        this.users = users;
        this.work = work;
        this.plans = plans;
    }

    @Transactional
    public Status enqueue(ScarPrincipal principal, Kind kind, UUID target) {
        switch (kind) {
            case GANTT_PLAN -> plans.requireRecalculationAccess(principal, target);
            case GANTT_PROJECT -> work.requireGanttProjectRecalculation(principal, target);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return insert(principal, kind, target, null, null);
    }

    @Transactional
    public Status enqueueExport(ScarPrincipal principal, UUID project, LocalDate week) {
        work.requireWeeklyExportAccess(principal, project, List.of());
        UUID target = UUID.nameUUIDFromBytes((project + ":" + week).getBytes(StandardCharsets.UTF_8));
        return insert(principal, Kind.WEEKLY_EXPORT, target, project, week);
    }

    private Status insert(ScarPrincipal principal, Kind kind, UUID target, UUID project, LocalDate week) {
        var active = jdbc.sql("""
            SELECT id, status FROM work_jobs
            WHERE owner_id = :owner AND kind = :kind AND target_id = :target AND status IN ('queued', 'running')
            """).params(Map.of("owner", principal.userId(), "kind", kind.name(), "target", target))
            .query((row, index) -> new Status(row.getObject("id", UUID.class), row.getString("status"), null)).optional();
        if (active.isPresent()) return active.get();

        return jdbc.sql("""
            INSERT INTO work_jobs (id, owner_id, kind, target_id, status, project_scope, week_start)
            VALUES (:id, :owner, :kind, :target, 'queued', :project, :week)
            ON CONFLICT (owner_id, kind, target_id) WHERE status IN ('queued', 'running')
            DO UPDATE SET target_id = EXCLUDED.target_id
            RETURNING id, status, failure_status
            """).params(Map.of("id", UUID.randomUUID(), "owner", principal.userId(), "kind", kind.name(), "target", target))
            .param("project", project, java.sql.Types.OTHER).param("week", week, java.sql.Types.DATE)
            .query((row, index) -> new Status(row.getObject("id", UUID.class), row.getString("status"), row.getObject("failure_status", Integer.class)))
            .single();
    }

    public Status status(ScarPrincipal principal, UUID id) {
        return jdbc.sql("SELECT id, status, failure_status FROM work_jobs WHERE id = :id AND owner_id = :owner")
            .params(Map.of("id", id, "owner", principal.userId()))
            .query((row, index) -> new Status(id, row.getString("status"), row.getObject("failure_status", Integer.class)))
            .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @Transactional
    public Optional<Claim> claim() {
        return jdbc.sql("""
            WITH candidate AS (
                SELECT id FROM work_jobs WHERE status = 'queued' OR (status = 'running' AND lease_until < CURRENT_TIMESTAMP)
                ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE work_jobs j SET status = 'running', attempts = attempts + 1, lease_until = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            FROM candidate WHERE j.id = candidate.id
            RETURNING j.id, j.owner_id, j.kind, j.target_id, j.attempts
            """).query((row, index) -> new Claim(row.getObject("id", UUID.class), row.getObject("owner_id", UUID.class),
                 Kind.valueOf(row.getString("kind")), row.getObject("target_id", UUID.class), row.getInt("attempts"))).optional();
    }

    @Transactional(timeout = 180)
    public void execute(Claim claim) {
        // Fence a recovered claim and commit the plan and its success status together.
        boolean owns = jdbc.sql("SELECT id FROM work_jobs WHERE id = :id AND attempts = :attempt AND status = 'running' FOR UPDATE")
            .params(Map.of("id", claim.id(), "attempt", claim.attempt())).query(UUID.class).optional().isPresent();
        if (!owns) return;
        if (claim.attempt() > 3) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        var user = users.findByIdWithRoles(claim.owner()).filter(actor -> actor.isActive())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        ScarPrincipal principal = new ScarPrincipal(user.getId(), user.getUsername(), user.getRoles());
        switch (claim.kind()) {
            case GANTT_PLAN -> plans.recalculate(principal, claim.target());
            case GANTT_PROJECT -> work.recalculateGantt(principal, claim.target());
            case WEEKLY_EXPORT -> export(claim, principal);
        }
        finish(claim, null);
    }

    public void fail(Claim claim, int status) { finish(claim, status); }

    private void export(Claim claim, ScarPrincipal principal) {
        record Scope(UUID project, LocalDate week) {}
        Scope scope = jdbc.sql("SELECT project_scope, week_start FROM work_jobs WHERE id = :id").param("id", claim.id())
            .query((row, index) -> new Scope(row.getObject("project_scope", UUID.class), row.getObject("week_start", LocalDate.class)))
            .single();
        var result = work.prepareWeeklyExport(principal, scope.project(), scope.week().toString());
        if (result.bytes().length > 10_000_000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        String ids = result.issueIds().stream().map(UUID::toString).collect(java.util.stream.Collectors.joining(","));
        jdbc.sql("UPDATE work_jobs SET result_file = :bytes, result_issue_ids = CAST(string_to_array(:ids, ',') AS UUID[]) WHERE id = :id")
            .param("id", claim.id()).param("bytes", result.bytes()).param("ids", ids).update();
    }

    @Transactional(readOnly = true)
    public FileResult file(ScarPrincipal principal, UUID id) {
        record Export(UUID project, LocalDate week, String ids, byte[] bytes) {}
        Export result = jdbc.sql("""
            SELECT project_scope, week_start, array_to_string(result_issue_ids, ',') issue_ids, result_file
            FROM work_jobs WHERE id = :id AND owner_id = :actor AND kind = 'WEEKLY_EXPORT' AND status = 'succeeded'
            """).params(Map.of("id", id, "actor", principal.userId()))
            .query((row, index) -> new Export(row.getObject("project_scope", UUID.class), row.getObject("week_start", LocalDate.class),
                row.getString("issue_ids"), row.getBytes("result_file"))).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<UUID> ids = result.ids() == null || result.ids().isEmpty() ? List.of()
            : Arrays.stream(result.ids().split(",")).map(UUID::fromString).toList();
        work.requireWeeklyExportAccess(principal, result.project(), ids);
        return new FileResult(result.bytes(), work.weeklyPlanFileName(result.week().toString()));
    }

    private void finish(Claim claim, Integer failure) {
        jdbc.sql("""
            UPDATE work_jobs SET status = :status, failure_status = :failure, finished_at = CURRENT_TIMESTAMP, lease_until = NULL
            WHERE id = :id AND attempts = :attempt AND status = 'running'
            """).param("status", failure == null ? "succeeded" : "failed")
            .param("failure", failure, java.sql.Types.INTEGER).param("id", claim.id()).param("attempt", claim.attempt()).update();
    }

    public void expireFinished() {
        jdbc.sql("DELETE FROM work_jobs WHERE finished_at < CURRENT_TIMESTAMP - INTERVAL '7 days'").update();
    }
}

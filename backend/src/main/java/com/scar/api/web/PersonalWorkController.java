package com.scar.api.web;

import com.scar.api.dto.CreateIssueRequest;
import com.scar.api.repository.IssueRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.PermissionService;
import com.scar.api.service.WorkService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users/me/personal-work")
public class PersonalWorkController {
    private final JdbcClient jdbc;
    private final WorkService work;
    private final UserRepository users;
    private final IssueRepository issues;
    private final PermissionService permissions;

    public PersonalWorkController(JdbcClient jdbc, WorkService work, UserRepository users,
                                  IssueRepository issues, PermissionService permissions) {
        this.jdbc = jdbc;
        this.work = work;
        this.users = users;
        this.issues = issues;
        this.permissions = permissions;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<Item> list(@AuthenticationPrincipal ScarPrincipal principal) {
        var user = users.findByIdWithRoles(principal.userId()).orElseThrow();
        return jdbc.sql("""
            SELECT id, kind, title, description, start_at, end_at, issue_id
            FROM personal_work_items WHERE owner_id = :owner
            ORDER BY start_at ASC NULLS FIRST, created_at DESC
            """).param("owner", user.getId()).query(this::map).list().stream().map(item -> {
                if (item.issueId() == null || issues.findByIdWithAccessDetails(item.issueId())
                    .filter(issue -> permissions.canReadIssue(user, issue)).isPresent()) return item;
                return new Item(item.id(), item.kind(), item.title(), item.description(), item.startAt(), item.endAt(), null);
            }).toList();
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public Item create(@AuthenticationPrincipal ScarPrincipal principal, @Valid @RequestBody Draft draft) {
        var user = users.findByIdWithRoles(principal.userId()).orElseThrow();
        lockOwner(user.getId());
        boolean focus = "focus".equals(draft.kind());
        if (focus) {
            if (draft.startAt() == null || draft.endAt() == null || Duration.between(draft.startAt(), draft.endAt()).compareTo(Duration.ofMinutes(1)) < 0
                || Duration.between(draft.startAt(), draft.endAt()).compareTo(Duration.ofHours(24)) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El bloque debe durar entre 1 minuto y 24 horas");
            }
            boolean overlaps = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM personal_work_items WHERE owner_id = :owner AND kind = 'focus'
                    AND start_at < :end AND end_at > :start)
                """).param("owner", user.getId()).param("end", draft.endAt()).param("start", draft.startAt()).query(Boolean.class).single();
            if (overlaps) throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya tienes otro bloque en ese horario");
        } else if (!"capture".equals(draft.kind()) || draft.startAt() != null || draft.endAt() != null || draft.issueId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (draft.issueId() != null) {
            var issue = issues.findByIdWithAccessDetails(draft.issueId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            permissions.requireReadIssue(user, issue);
        }
        int count = jdbc.sql("SELECT COUNT(*) FROM personal_work_items WHERE owner_id = :owner")
            .param("owner", user.getId()).query(Integer.class).single();
        if (count >= 200) throw new ResponseStatusException(HttpStatus.CONFLICT, "Alcanzaste el límite de elementos personales");
        Item item = new Item(UUID.randomUUID(), draft.kind(), draft.title().strip(),
            draft.description() == null ? "" : draft.description().strip(), draft.startAt(), draft.endAt(), draft.issueId());
        jdbc.sql("""
            INSERT INTO personal_work_items (id, owner_id, kind, title, description, start_at, end_at, issue_id)
            VALUES (:id, :owner, :kind, :title, :description, :start, :end, :issue)
            """).param("id", item.id()).param("owner", user.getId()).param("kind", item.kind()).param("title", item.title())
            .param("description", item.description()).param("start", item.startAt(), Types.TIMESTAMP_WITH_TIMEZONE)
            .param("end", item.endAt(), Types.TIMESTAMP_WITH_TIMEZONE).param("issue", item.issueId(), Types.OTHER).update();
        return item;
    }

    @PostMapping("/{id}/promote")
    @Transactional
    public Item promote(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id, @Valid @RequestBody Target target) {
        UUID owner = principal.userId();
        lockOwner(owner);
        Item item = jdbc.sql("""
            SELECT id, kind, title, description, start_at, end_at, issue_id
            FROM personal_work_items WHERE owner_id = :owner AND id = :id AND kind = 'capture' FOR UPDATE
            """).param("owner", owner).param("id", id).query(this::map).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (item.issueId() != null) {
            var issue = issues.findByIdWithAccessDetails(item.issueId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            permissions.requireReadIssue(users.findByIdWithRoles(owner).orElseThrow(), issue);
            return item;
        }
        var card = work.createIssue(principal, new CreateIssueRequest(target.projectId().toString(), item.title(),
            "todo", null, null, null, null, null, null, null, item.description()));
        UUID issueId = UUID.fromString(card.id());
        jdbc.sql("UPDATE personal_work_items SET issue_id = :issue WHERE owner_id = :owner AND id = :id")
            .param("issue", issueId).param("owner", owner).param("id", id).update();
        return new Item(id, item.kind(), item.title(), item.description(), null, null, issueId);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        jdbc.sql("DELETE FROM personal_work_items WHERE id = :id AND owner_id = :owner")
            .param("id", id).param("owner", principal.userId()).update();
    }

    private void lockOwner(UUID owner) {
        jdbc.sql("SELECT id FROM users WHERE id = :owner FOR UPDATE").param("owner", owner).query(UUID.class).single();
    }

    private Item map(ResultSet row, int index) throws SQLException {
        return new Item(row.getObject("id", UUID.class), row.getString("kind"), row.getString("title"), row.getString("description"),
            row.getObject("start_at", OffsetDateTime.class), row.getObject("end_at", OffsetDateTime.class), row.getObject("issue_id", UUID.class));
    }

    public record Item(UUID id, String kind, String title, String description, OffsetDateTime startAt, OffsetDateTime endAt, UUID issueId) {}
    public record Draft(@NotBlank String kind, @NotBlank @Size(max = 500) String title, @Size(max = 10000) String description,
                        OffsetDateTime startAt, OffsetDateTime endAt, UUID issueId) {}
    public record Target(@NotNull UUID projectId) {}
}

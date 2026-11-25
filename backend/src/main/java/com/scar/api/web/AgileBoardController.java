package com.scar.api.web;

import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.ProjectType;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.PermissionService;
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

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users/me/agile-boards")
public class AgileBoardController {
    private final JdbcClient jdbc;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final PermissionService permissions;

    public AgileBoardController(JdbcClient jdbc, ProjectRepository projects, UserRepository users, PermissionService permissions) {
        this.jdbc = jdbc;
        this.projects = projects;
        this.users = users;
        this.permissions = permissions;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<Board> list(@AuthenticationPrincipal ScarPrincipal principal) {
        User user = activeUser(principal);
        List<Identity> boards = jdbc.sql("SELECT id, name FROM agile_boards WHERE owner_id = :owner ORDER BY lower(name), id")
            .param("owner", user.getId()).query((row, index) -> new Identity(row.getObject("id", UUID.class), row.getString("name")))
            .list();
        if (boards.isEmpty()) return List.of();
        Set<UUID> accessible = accessibleProjects(user, projects.findAllWithMembers());
        return boards.stream().map(board -> withProjects(board, projectIds(board.id()), accessible)).toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public Board get(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        User user = activeUser(principal);
        Identity board = ownedBoard(user.getId(), id);
        List<UUID> ids = projectIds(id);
        return withProjects(board, ids, accessibleProjects(user, projects.findAllById(ids)));
    }

    @PostMapping
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    public Board create(@AuthenticationPrincipal ScarPrincipal principal, @Valid @RequestBody Draft draft) {
        return save(activeUser(principal), UUID.randomUUID(), draft, true);
    }

    @PutMapping("/{id}")
    @Transactional
    public Board update(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id, @Valid @RequestBody Draft draft) {
        return save(activeUser(principal), id, draft, false);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        jdbc.sql("DELETE FROM agile_boards WHERE owner_id = :owner AND id = :id")
            .param("owner", principal.userId()).param("id", id).update();
    }

    private Board save(User user, UUID id, Draft draft, boolean creating) {
        UUID owner = user.getId();
        jdbc.sql("SELECT id FROM users WHERE id = :owner FOR UPDATE").param("owner", owner).query(UUID.class).single();
        if (!creating) ownedBoard(owner, id);
        List<UUID> projectIds = List.copyOf(new LinkedHashSet<>(draft.projectIds()));
        if (!accessibleProjects(user, projects.findAllById(projectIds)).containsAll(projectIds)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Un proyecto seleccionado ya no está disponible");
        }
        String name = draft.name().strip();
        if (creating && jdbc.sql("SELECT COUNT(*) FROM agile_boards WHERE owner_id = :owner")
            .param("owner", owner).query(Integer.class).single() >= 30) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Alcanzaste el límite de tableros");
        }
        String key = name.toLowerCase(Locale.ROOT);
        if (jdbc.sql("SELECT EXISTS (SELECT 1 FROM agile_boards WHERE owner_id = :owner AND name_key = :key AND id <> :id)")
            .param("owner", owner).param("key", key).param("id", id).query(Boolean.class).single()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un tablero con ese nombre");
        }
        String statement = creating
            ? "INSERT INTO agile_boards (id, owner_id, name, name_key) VALUES (:id, :owner, :name, :key)"
            : "UPDATE agile_boards SET name = :name, name_key = :key WHERE owner_id = :owner AND id = :id";
        int updated = jdbc.sql(statement).param("id", id).param("owner", owner).param("name", name).param("key", key).update();
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!creating) jdbc.sql("DELETE FROM agile_board_projects WHERE board_id = :id").param("id", id).update();
        for (UUID projectId : projectIds) {
            jdbc.sql("INSERT INTO agile_board_projects (board_id, project_id) VALUES (:id, :project)")
                .param("id", id).param("project", projectId).update();
        }
        return new Board(id, name, projectIds);
    }

    private Identity ownedBoard(UUID owner, UUID id) {
        return jdbc.sql("SELECT id, name FROM agile_boards WHERE owner_id = :owner AND id = :id")
            .param("owner", owner).param("id", id).query((row, index) -> new Identity(row.getObject("id", UUID.class), row.getString("name")))
            .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private List<UUID> projectIds(UUID id) {
        return jdbc.sql("SELECT project_id FROM agile_board_projects WHERE board_id = :id ORDER BY project_id")
            .param("id", id).query(UUID.class).list();
    }

    private Board withProjects(Identity board, List<UUID> ids, Set<UUID> accessible) {
        return new Board(board.id(), board.name(), ids.stream().filter(accessible::contains).toList());
    }

    private Set<UUID> accessibleProjects(User user, List<Project> candidates) {
        return candidates.stream().filter(project -> project.getType() == ProjectType.STANDARD && permissions.canAccessProject(user, project))
            .map(Project::getId).collect(Collectors.toSet());
    }

    private User activeUser(ScarPrincipal principal) {
        return users.findByIdWithRoles(principal.userId()).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private record Identity(UUID id, String name) {}
    public record Board(UUID id, String name, List<UUID> projectIds) {}
    public record Draft(@NotBlank @Size(max = 80) String name,
                        @NotNull @Size(min = 1, max = 50) List<@NotNull UUID> projectIds) {}
}

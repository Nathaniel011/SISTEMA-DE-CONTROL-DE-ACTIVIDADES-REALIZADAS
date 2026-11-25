package com.scar.api.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scar.api.security.ScarPrincipal;
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

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/users/me/issue-views")
public class IssueViewController {
    private static final Set<String> KEYS = Set.of("view", "q", "board", "boards", "status", "scope", "activity",
        "member", "priority", "sort", "group", "createdFrom", "createdTo", "month");
    private static final TypeReference<Map<String, String>> FILTER_TYPE = new TypeReference<>() {};
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public IssueViewController(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @GetMapping
    public List<View> list(@AuthenticationPrincipal ScarPrincipal principal) {
        return jdbc.sql("SELECT id, name, filters FROM saved_issue_views WHERE owner_id = :owner ORDER BY created_at, id")
            .param("owner", principal.userId())
            .query((rs, index) -> {
                try {
                    return new View(rs.getObject("id", UUID.class), rs.getString("name"), json.readValue(rs.getString("filters"), FILTER_TYPE));
                } catch (JsonProcessingException ex) {
                    throw new IllegalStateException("Vista guardada inválida", ex);
                }
            }).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public View create(@AuthenticationPrincipal ScarPrincipal principal, @Valid @RequestBody Draft draft) throws JsonProcessingException {
        UUID ownerId = principal.userId();
        if (!KEYS.containsAll(draft.filters().keySet())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        jdbc.sql("SELECT id FROM users WHERE id = :owner FOR UPDATE").param("owner", ownerId).query(UUID.class).single();
        int count = jdbc.sql("SELECT COUNT(*) FROM saved_issue_views WHERE owner_id = :owner")
            .param("owner", ownerId).query(Integer.class).single();
        if (count >= 20) throw new ResponseStatusException(HttpStatus.CONFLICT, "Límite de vistas guardadas");
        String name = draft.name().strip();
        UUID id = UUID.randomUUID();
        int created = jdbc.sql("""
            INSERT INTO saved_issue_views (id, owner_id, name, name_key, filters)
            VALUES (:id, :owner, :name, :key, CAST(:filters AS jsonb))
            ON CONFLICT (owner_id, name_key) DO NOTHING
            """).param("id", id).param("owner", ownerId).param("name", name)
            .param("key", name.toLowerCase(Locale.ROOT))
            .param("filters", json.writeValueAsString(draft.filters())).update();
        if (created == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Nombre de vista duplicado");
        return new View(id, name, draft.filters());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        jdbc.sql("DELETE FROM saved_issue_views WHERE id = :id AND owner_id = :owner")
            .param("id", id).param("owner", principal.userId()).update();
    }

    public record View(UUID id, String name, Map<String, String> filters) {}
    public record Draft(@NotBlank @Size(max = 48) String name,
                       @NotNull @Size(max = 14) Map<@NotBlank String, @NotNull @Size(max = 4000) String> filters) {}
}

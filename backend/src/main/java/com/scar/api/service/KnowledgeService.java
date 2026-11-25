package com.scar.api.service;

import com.scar.api.domain.entity.KnowledgeArticle;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.dto.KnowledgeArticleDto;
import com.scar.api.dto.KnowledgeArticleRequest;
import com.scar.api.repository.KnowledgeArticleRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class KnowledgeService {

    private final KnowledgeArticleRepository articleRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;
    private final JdbcClient jdbc;

    public KnowledgeService(
        KnowledgeArticleRepository articleRepository,
        ProjectRepository projectRepository,
        UserRepository userRepository,
        PermissionService permissionService,
        JdbcClient jdbc
    ) {
        this.articleRepository = articleRepository;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<KnowledgeArticleDto> list(ScarPrincipal principal, UUID projectId, String query) {
        User currentUser = loadCurrentUser(principal);
        if (projectId != null) permissionService.requireAccessProject(currentUser, loadProject(projectId));
        String needle = query == null ? "" : query.strip();
        if (needle.length() > 255) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La búsqueda es demasiado larga");
        return jdbc.sql("""
            SELECT a.id, a.project_id, p.name AS project_name, a.title, a.slug, COALESCE(a.content, '') AS content,
                a.tags, a.status, author.full_name AS author_name, editor.full_name AS editor_name,
                a.created_at, a.updated_at, a.project_removed, (:manager OR COALESCE(a.author_id = :actor, FALSE)) AS can_edit
            FROM knowledge_articles a
            LEFT JOIN projects p ON p.id = a.project_id
            LEFT JOIN users author ON author.id = a.author_id
            LEFT JOIN users editor ON editor.id = a.updated_by_id
            WHERE (CAST(:project AS UUID) IS NULL OR a.project_id = :project)
              AND (:manager OR (NOT a.project_removed AND (a.project_id IS NULL OR EXISTS (
                    SELECT 1 FROM project_members pm WHERE pm.project_id = a.project_id AND pm.user_id = :actor))))
              AND (:needle = '' OR position(translate(lower(CAST(:needle AS TEXT)), 'áéíóúüñ', 'aeiouun')
                  IN translate(lower(concat_ws(' ', a.title, a.content, a.tags)), 'áéíóúüñ', 'aeiouun')) > 0)
            ORDER BY a.updated_at DESC, a.id
            """)
            .param("actor", currentUser.getId())
            .param("manager", permissionService.isAdminOrChief(currentUser))
            .param("project", projectId, Types.OTHER)
            .param("needle", needle)
            .query((row, index) -> new KnowledgeArticleDto(row.getString("id"), row.getString("project_id"),
                row.getString("project_name"), row.getString("title"), row.getString("slug"), row.getString("content"),
                fromTagText(row.getString("tags")), row.getString("status"), row.getString("author_name"), row.getString("editor_name"),
                row.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                row.getObject("updated_at", OffsetDateTime.class).toInstant().toString(),
                row.getBoolean("can_edit"), row.getBoolean("project_removed"))).list();
    }

    @Transactional(readOnly = true)
    public KnowledgeArticleDto get(ScarPrincipal principal, UUID id) {
        User user = loadCurrentUser(principal);
        KnowledgeArticle article = articleRepository.findById(id).orElseThrow(this::missingArticle);
        requireArticleAccess(user, article);
        return toDto(article, user);
    }

    @Transactional
    public KnowledgeArticleDto create(ScarPrincipal principal, KnowledgeArticleRequest request) {
        User author = loadCurrentUser(principal);
        validateScope(request);
        Project project = loadProject(request.projectId());
        if (project != null) {
            permissionService.requireAccessProject(author, project);
        }
        KnowledgeArticle article = new KnowledgeArticle();
        article.setProject(project);
        article.setTitle(requiredTitle(request.title()));
        article.setSlug(uniqueSlug(article.getTitle()));
        article.setContent(request.content() == null ? "" : request.content());
        article.setTags(toTagText(request.tags()));
        article.setStatus(normalizeStatus(request.status()));
        article.setAuthor(author);
        article.setUpdatedBy(author);
        return toDto(articleRepository.save(article), author);
    }

    @Transactional
    public KnowledgeArticleDto update(ScarPrincipal principal, UUID id, KnowledgeArticleRequest request) {
        User editor = loadCurrentUser(principal);
        KnowledgeArticle article = articleRepository.findForUpdate(id).orElseThrow(this::missingArticle);
        requireEditor(editor, article);
        validateScope(request);
        if (request.expectedUpdatedAt() != null && !request.expectedUpdatedAt().equals(article.getUpdatedAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El artículo cambió desde que lo abriste");
        }

        if (request.projectId() != null) {
            Project project = loadProject(request.projectId());
            permissionService.requireAccessProject(editor, project);
            article.setProject(project);
            article.setProjectRemoved(false);
        } else if (request.clearProject() && !article.isProjectRemoved()) {
            article.setProject(null);
        }
        if (request.title() != null) {
            String nextTitle = requiredTitle(request.title());
            if (!nextTitle.equals(article.getTitle())) {
                article.setSlug(uniqueSlug(nextTitle));
            }
            article.setTitle(nextTitle);
        }
        if (request.content() != null) {
            article.setContent(request.content());
        }
        if (request.tags() != null) {
            article.setTags(toTagText(request.tags()));
        }
        if (request.status() != null && !article.isProjectRemoved()) {
            article.setStatus(normalizeStatus(request.status()));
        }
        article.setUpdatedBy(editor);
        return toDto(articleRepository.saveAndFlush(article), editor);
    }

    @Transactional
    public void delete(ScarPrincipal principal, UUID id) {
        User user = loadCurrentUser(principal);
        KnowledgeArticle article = articleRepository.findForUpdate(id).orElseThrow(this::missingArticle);
        requireEditor(user, article);
        articleRepository.delete(article);
    }

    private ResponseStatusException missingArticle() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Artículo no encontrado");
    }

    private void validateScope(KnowledgeArticleRequest request) {
        if (request.projectId() != null && request.clearProject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona un solo ámbito para el artículo");
        }
    }

    private User loadCurrentUser(ScarPrincipal principal) {
        return userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private void requireArticleAccess(User user, KnowledgeArticle article) {
        if (article.isProjectRemoved() && !permissionService.isAdminOrChief(user)) throw missingArticle();
        if (article.getProject() != null) {
            permissionService.requireAccessProject(user, article.getProject());
        }
    }

    private void requireEditor(User user, KnowledgeArticle article) {
        requireArticleAccess(user, article);
        if (!canEdit(user, article)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para modificar este artículo");
    }

    private boolean canEdit(User user, KnowledgeArticle article) {
        return permissionService.isAdminOrChief(user)
            || (article.getAuthor() != null && user.getId().equals(article.getAuthor().getId()));
    }

    private Project loadProject(UUID projectId) {
        if (projectId == null) return null;
        return projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
    }

    private String requiredTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El título es obligatorio");
        }
        return title.trim();
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "draft";
        }
        String value = status.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "draft", "published", "archived" -> value;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado de artículo inválido");
        };
    }

    private String toTagText(List<String> tags) {
        if (tags == null) {
            return "";
        }
        return tags.stream()
            .map(String::trim)
            .filter(t -> !t.isBlank())
            .distinct()
            .collect(Collectors.joining(","));
    }

    private List<String> fromTagText(String tags) {
        if (tags == null || tags.isBlank()) {
            return List.of();
        }
        return Arrays.stream(tags.split(","))
            .map(String::trim)
            .filter(t -> !t.isBlank())
            .toList();
    }

    private String uniqueSlug(String title) {
        String base = Normalizer.normalize(title, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
        if (base.isBlank()) {
            base = "articulo";
        }
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        return base + "-" + suffix;
    }

    private KnowledgeArticleDto toDto(KnowledgeArticle article, User user) {
        return new KnowledgeArticleDto(
            article.getId().toString(),
            article.getProject() != null ? article.getProject().getId().toString() : null,
            article.getProject() != null ? article.getProject().getName() : null,
            article.getTitle(),
            article.getSlug(),
            article.getContent() == null ? "" : article.getContent(),
            fromTagText(article.getTags()),
            article.getStatus(),
            article.getAuthor() != null ? article.getAuthor().getFullName() : null,
            article.getUpdatedBy() != null ? article.getUpdatedBy().getFullName() : null,
            article.getCreatedAt().toString(),
            article.getUpdatedAt().toString(),
            canEdit(user, article),
            article.isProjectRemoved()
        );
    }
}

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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class KnowledgeService {

    private final KnowledgeArticleRepository articleRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;

    public KnowledgeService(
        KnowledgeArticleRepository articleRepository,
        ProjectRepository projectRepository,
        UserRepository userRepository,
        PermissionService permissionService
    ) {
        this.articleRepository = articleRepository;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
    }

    @Transactional(readOnly = true)
    public List<KnowledgeArticleDto> list(ScarPrincipal principal, UUID projectId, String query) {
        User currentUser = loadCurrentUser(principal);
        if (projectId != null) {
            Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
            permissionService.requireAccessProject(currentUser, project);
        }
        String normalized = query == null || query.isBlank() ? null : query.trim();
        return articleRepository.search(projectId, normalized).stream()
            .filter(article -> canAccessArticle(currentUser, article))
            .map(this::toDto)
            .toList();
    }

    @Transactional(readOnly = true)
    public KnowledgeArticleDto get(ScarPrincipal principal, UUID id) {
        KnowledgeArticle article = loadArticle(id);
        requireArticleAccess(principal, article);
        return toDto(article);
    }

    @Transactional
    public KnowledgeArticleDto create(ScarPrincipal principal, KnowledgeArticleRequest request) {
        User author = loadCurrentUser(principal);
        Project project = loadProject(request.projectId());
        if (project != null) {
            permissionService.requireAccessProject(author, project);
        }
        KnowledgeArticle article = new KnowledgeArticle();
        article.setProject(project);
        article.setTitle(requiredTitle(request.title()));
        article.setSlug(uniqueSlug(request.title()));
        article.setContent(request.content() == null ? "" : request.content());
        article.setTags(toTagText(request.tags()));
        article.setStatus(normalizeStatus(request.status()));
        article.setAuthor(author);
        article.setUpdatedBy(author);
        return toDto(articleRepository.save(article));
    }

    @Transactional
    public KnowledgeArticleDto update(ScarPrincipal principal, UUID id, KnowledgeArticleRequest request) {
        KnowledgeArticle article = loadArticle(id);
        requireArticleAccess(principal, article);
        User editor = loadCurrentUser(principal);

        if (request.projectId() != null) {
            Project project = loadProject(request.projectId());
            if (project != null) {
                permissionService.requireAccessProject(editor, project);
            }
            article.setProject(project);
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
        if (request.status() != null) {
            article.setStatus(normalizeStatus(request.status()));
        }
        article.setUpdatedBy(editor);
        return toDto(articleRepository.save(article));
    }

    @Transactional
    public void delete(ScarPrincipal principal, UUID id) {
        KnowledgeArticle article = loadArticle(id);
        requireArticleAccess(principal, article);
        articleRepository.delete(article);
    }

    private KnowledgeArticle loadArticle(UUID id) {
        return articleRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Articulo no encontrado"));
    }

    private User loadUser(UUID id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private User loadCurrentUser(ScarPrincipal principal) {
        return userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private void requireArticleAccess(ScarPrincipal principal, KnowledgeArticle article) {
        if (article.getProject() != null) {
            permissionService.requireAccessProject(loadCurrentUser(principal), article.getProject());
        }
    }

    private boolean canAccessArticle(User user, KnowledgeArticle article) {
        return article.getProject() == null || permissionService.canAccessProject(user, article.getProject());
    }

    private Project loadProject(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return null;
        }
        return projectRepository.findById(UUID.fromString(projectId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
    }

    private String requiredTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El titulo es obligatorio");
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
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado de articulo invalido");
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
            .reduce((a, b) -> a + "," + b)
            .orElse("");
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

    private KnowledgeArticleDto toDto(KnowledgeArticle article) {
        return new KnowledgeArticleDto(
            article.getId().toString(),
            article.getProject() != null ? article.getProject().getId().toString() : null,
            article.getProject() != null ? article.getProject().getName() : null,
            article.getTitle(),
            article.getSlug(),
            article.getContent(),
            fromTagText(article.getTags()),
            article.getStatus(),
            article.getAuthor() != null ? article.getAuthor().getFullName() : null,
            article.getUpdatedBy() != null ? article.getUpdatedBy().getFullName() : null,
            article.getCreatedAt().toString(),
            article.getUpdatedAt().toString()
        );
    }
}

package com.scar.api.service;

import com.scar.api.domain.entity.KnowledgeArticle;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.dto.KnowledgeArticleRequest;
import com.scar.api.repository.KnowledgeArticleRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeServiceTest {
    private final UUID ownerId = UUID.randomUUID();
    private final UUID articleId = UUID.randomUUID();
    private final User owner = mock(User.class);
    private final ScarPrincipal principal = new ScarPrincipal(ownerId, "editor", Set.of());
    private final KnowledgeArticleRepository articles = mock(KnowledgeArticleRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final PermissionService permissions = mock(PermissionService.class);
    private final KnowledgeService service = new KnowledgeService(articles, mock(ProjectRepository.class), users,
        permissions, mock(JdbcClient.class));

    @Test
    void keepsProjectWhenOmittedAndClearsItWhenRequested() {
        KnowledgeArticle article = ownedArticle();
        Project project = mock(Project.class);
        when(project.getId()).thenReturn(UUID.randomUUID());
        article.setProject(project);

        assertEquals(project.getId().toString(), service.update(principal, articleId,
            new KnowledgeArticleRequest(null, "Nuevo título", null, null, null, false, null)).projectId());
        assertNull(service.update(principal, articleId,
            new KnowledgeArticleRequest(null, null, null, null, null, true, null)).projectId());
    }

    @Test
    void rejectsStaleUpdateWithoutOverwritingContent() {
        KnowledgeArticle article = ownedArticle();
        var error = assertThrows(ResponseStatusException.class, () -> service.update(principal, articleId,
            new KnowledgeArticleRequest(null, null, "Otro contenido", null, null, false, Instant.EPOCH)));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals("Contenido original", article.getContent());
        verify(articles, never()).saveAndFlush(any());
    }

    @Test
    void otherReaderCannotDeleteGeneralArticle() {
        KnowledgeArticle article = ownedArticle();
        User author = mock(User.class);
        when(author.getId()).thenReturn(UUID.randomUUID());
        article.setAuthor(author);

        var error = assertThrows(ResponseStatusException.class, () -> service.delete(principal, articleId));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(articles, never()).delete(any());
    }

    private KnowledgeArticle ownedArticle() {
        var article = new KnowledgeArticle();
        ReflectionTestUtils.setField(article, "id", articleId);
        article.setTitle("Guía original");
        article.setContent("Contenido original");
        article.setAuthor(owner);
        when(owner.getId()).thenReturn(ownerId);
        when(users.findByIdWithRoles(ownerId)).thenReturn(Optional.of(owner));
        when(articles.findForUpdate(articleId)).thenReturn(Optional.of(article));
        when(articles.saveAndFlush(article)).thenReturn(article);
        return article;
    }
}

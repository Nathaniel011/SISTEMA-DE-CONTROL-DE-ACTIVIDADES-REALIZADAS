package com.scar.api.repository;

import com.scar.api.domain.entity.KnowledgeArticle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KnowledgeArticleRepository extends JpaRepository<KnowledgeArticle, UUID> {

    @Query("""
        SELECT a FROM KnowledgeArticle a
        LEFT JOIN FETCH a.project
        LEFT JOIN FETCH a.author
        LEFT JOIN FETCH a.updatedBy
        WHERE (:projectId IS NULL OR a.project.id = :projectId)
          AND (
            :query IS NULL
            OR LOWER(a.title) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(a.content) LIKE LOWER(CONCAT('%', :query, '%'))
            OR LOWER(a.tags) LIKE LOWER(CONCAT('%', :query, '%'))
          )
        ORDER BY a.updatedAt DESC
        """)
    List<KnowledgeArticle> search(UUID projectId, String query);

    Optional<KnowledgeArticle> findBySlug(String slug);
}

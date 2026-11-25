package com.scar.api.repository;

import com.scar.api.domain.entity.KnowledgeArticle;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface KnowledgeArticleRepository extends JpaRepository<KnowledgeArticle, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select article from KnowledgeArticle article where article.id = :id")
    Optional<KnowledgeArticle> findForUpdate(UUID id);
}

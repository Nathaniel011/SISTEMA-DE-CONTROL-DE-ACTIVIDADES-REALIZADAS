package com.scar.api.repository;

import com.scar.api.domain.entity.IssueComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface IssueCommentRepository extends JpaRepository<IssueComment, UUID> {
    List<IssueComment> findByIssueIdOrderByCreatedAtAsc(UUID issueId);

    @Query("SELECT c FROM IssueComment c JOIN FETCH c.author WHERE c.issue.id IN :issueIds ORDER BY c.createdAt ASC")
    List<IssueComment> findByIssueIdInOrderByCreatedAtAsc(@Param("issueIds") Collection<UUID> issueIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM IssueComment c WHERE c.issue.id = :issueId")
    void deleteByIssueId(@Param("issueId") UUID issueId);
}

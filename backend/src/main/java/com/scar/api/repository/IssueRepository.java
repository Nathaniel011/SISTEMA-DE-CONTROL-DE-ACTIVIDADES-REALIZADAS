package com.scar.api.repository;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.enums.IssueColumn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IssueRepository extends JpaRepository<Issue, UUID> {

    @Query("""
        SELECT i FROM Issue i
        LEFT JOIN FETCH i.assignee
        LEFT JOIN FETCH i.project
        LEFT JOIN FETCH i.boardList
        LEFT JOIN FETCH i.parentIssue
        WHERE i.project.id IN :projectIds
        """)
    List<Issue> findByProjectIdIn(@Param("projectIds") Collection<UUID> projectIds);

    @Query("SELECT i FROM Issue i LEFT JOIN FETCH i.assignee WHERE i.project.id = :projectId")
    List<Issue> findByProjectId(@Param("projectId") UUID projectId);

    Optional<Issue> findTopByProjectIdOrderByIssueNumberDesc(UUID projectId);

    List<Issue> findByProjectIdAndColumnIdOrderBySortOrder(UUID projectId, IssueColumn columnId);

    long countByProjectIdAndBoardListId(UUID projectId, UUID boardListId);

    List<Issue> findByParentIssueId(UUID parentIssueId);

    Optional<Issue> findByPublicToken(UUID publicToken);

    @Query("""
        SELECT i FROM Issue i
        JOIN FETCH i.project
        LEFT JOIN FETCH i.createdBy
        LEFT JOIN FETCH i.assignee
        WHERE i.id = :id
        """)
    Optional<Issue> findByIdWithAccessDetails(@Param("id") UUID id);

    @Modifying
    @Query("UPDATE Issue i SET i.assignee = NULL WHERE i.assignee.id = :userId")
    void clearAssigneeByUserId(@Param("userId") UUID userId);
}

package com.scar.api.repository;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.enums.IssueColumn;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    Optional<Issue> findByProject_KeyCodeAndIssueNumber(String projectKey, int issueNumber);

    List<Issue> findByProjectIdAndColumnIdOrderBySortOrder(UUID projectId, IssueColumn columnId);

    long countByProjectIdAndColumnId(UUID projectId, IssueColumn columnId);

    long countByProjectIdAndBoardListId(UUID projectId, UUID boardListId);

    List<Issue> findByParentIssueId(UUID parentIssueId);

    Optional<Issue> findByPublicTokenAndPublicTrackingEnabledTrue(UUID publicToken);

    Optional<Issue> findBySubmissionKey(UUID submissionKey);

    @Query("""
        SELECT i FROM Issue i
        JOIN FETCH i.project
        LEFT JOIN FETCH i.createdBy
        LEFT JOIN FETCH i.assignee
        WHERE i.id = :id
        """)
    Optional<Issue> findByIdWithAccessDetails(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Issue i WHERE i.id = :id")
    Optional<Issue> findByIdForUpdate(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Issue i WHERE i.id IN :ids ORDER BY i.id")
    List<Issue> findAllForUpdate(@Param("ids") Collection<UUID> ids);

    @Modifying
    @Query("UPDATE Issue i SET i.assignee = NULL WHERE i.assignee.id = :userId")
    void clearAssigneeByUserId(@Param("userId") UUID userId);
}

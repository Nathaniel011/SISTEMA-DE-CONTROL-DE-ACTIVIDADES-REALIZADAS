package com.scar.api.repository;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.enums.IssueColumn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IssueRepository extends JpaRepository<Issue, UUID> {

    @Query("SELECT i FROM Issue i LEFT JOIN FETCH i.labels LEFT JOIN FETCH i.assignee")
    List<Issue> findAll();

    @Query("SELECT i FROM Issue i LEFT JOIN FETCH i.labels LEFT JOIN FETCH i.assignee WHERE i.project.id = :projectId")
    List<Issue> findByProjectId(UUID projectId);

    Optional<Issue> findTopByProjectIdOrderByIssueNumberDesc(UUID projectId);

    List<Issue> findByProjectIdAndColumnIdOrderBySortOrder(UUID projectId, IssueColumn columnId);

    Optional<Issue> findByPublicToken(UUID publicToken);
}

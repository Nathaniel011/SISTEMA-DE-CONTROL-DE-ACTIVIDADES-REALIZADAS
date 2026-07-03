package com.scar.api.repository;

import com.scar.api.domain.entity.IssueDependency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface IssueDependencyRepository extends JpaRepository<IssueDependency, UUID> {

    List<IssueDependency> findByIssueId(UUID issueId);

    @Query("SELECT d FROM IssueDependency d JOIN FETCH d.issue i JOIN FETCH d.dependsOnIssue WHERE i.project.id = :projectId")
    List<IssueDependency> findByProjectId(@Param("projectId") UUID projectId);

    @Query("SELECT d FROM IssueDependency d JOIN FETCH d.issue i JOIN FETCH d.dependsOnIssue WHERE i.project.id IN :projectIds")
    List<IssueDependency> findByProjectIdIn(@Param("projectIds") Collection<UUID> projectIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM IssueDependency d WHERE d.issue.id = :issueId OR d.dependsOnIssue.id = :issueId")
    void deleteAllForIssue(@Param("issueId") UUID issueId);
}

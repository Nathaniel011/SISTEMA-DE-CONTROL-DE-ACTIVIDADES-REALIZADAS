package com.scar.api.repository;

import com.scar.api.domain.entity.IssueDependency;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface IssueDependencyRepository extends JpaRepository<IssueDependency, UUID> {

    List<IssueDependency> findByIssueId(UUID issueId);

    @Query("SELECT d FROM IssueDependency d JOIN FETCH d.issue i JOIN FETCH d.dependsOnIssue WHERE i.project.id = :projectId")
    List<IssueDependency> findByProjectId(UUID projectId);
}

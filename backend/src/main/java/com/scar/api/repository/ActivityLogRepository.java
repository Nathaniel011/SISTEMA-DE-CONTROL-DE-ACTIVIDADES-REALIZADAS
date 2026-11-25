package com.scar.api.repository;

import com.scar.api.domain.entity.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, UUID> {
    @EntityGraph(attributePaths = "user")
    List<ActivityLog> findTop100ByIssueIdAndActionInOrderByCreatedAtDescIdDesc(UUID issueId, Collection<String> actions);
}

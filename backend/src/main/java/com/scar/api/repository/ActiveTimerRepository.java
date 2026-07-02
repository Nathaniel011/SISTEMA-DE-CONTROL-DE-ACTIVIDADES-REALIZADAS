package com.scar.api.repository;

import com.scar.api.domain.entity.ActiveTimer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.UUID;

public interface ActiveTimerRepository extends JpaRepository<ActiveTimer, UUID> {

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM ActiveTimer t WHERE t.issue.id = :issueId")
    void deleteByIssueId(@Param("issueId") UUID issueId);
}

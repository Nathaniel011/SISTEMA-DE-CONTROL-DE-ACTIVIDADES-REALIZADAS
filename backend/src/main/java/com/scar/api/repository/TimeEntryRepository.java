package com.scar.api.repository;

import com.scar.api.domain.entity.TimeEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {

    List<TimeEntry> findByIssueIdOrderByLoggedAtDesc(UUID issueId);
    List<TimeEntry> findByUserId(UUID userId);
}

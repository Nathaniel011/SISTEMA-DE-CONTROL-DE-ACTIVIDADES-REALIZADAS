package com.scar.api.repository;

import com.scar.api.domain.entity.TimeEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {

    List<TimeEntry> findByIssueIdOrderByLoggedAtDesc(UUID issueId);

    @Query("SELECT t FROM TimeEntry t JOIN t.issue i WHERE i.project.organization.id = :orgId ORDER BY t.loggedAt DESC")
    List<TimeEntry> findByOrganizationId(UUID orgId);
}

package com.scar.api.repository;

import com.scar.api.domain.entity.TimeEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {

    @Query("SELECT t FROM TimeEntry t JOIN FETCH t.user JOIN FETCH t.issue WHERE t.issue.id = :issueId ORDER BY t.loggedAt DESC")
    List<TimeEntry> findByIssueIdOrderByLoggedAtDesc(UUID issueId);

    @Query("SELECT t FROM TimeEntry t JOIN FETCH t.user JOIN FETCH t.issue WHERE t.user.id = :userId")
    List<TimeEntry> findByUserId(UUID userId);
}

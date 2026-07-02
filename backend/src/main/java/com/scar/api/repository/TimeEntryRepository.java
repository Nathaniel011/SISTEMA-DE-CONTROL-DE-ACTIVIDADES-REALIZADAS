package com.scar.api.repository;

import com.scar.api.domain.entity.TimeEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface TimeEntryRepository extends JpaRepository<TimeEntry, UUID> {

    @Query("SELECT t FROM TimeEntry t JOIN FETCH t.user JOIN FETCH t.issue i WHERE t.issue.id = :issueId ORDER BY t.loggedAt DESC")
    List<TimeEntry> findByIssueIdOrderByLoggedAtDesc(@Param("issueId") UUID issueId);

    @Query("""
        SELECT t FROM TimeEntry t
        JOIN FETCH t.user
        JOIN FETCH t.issue i
        JOIN FETCH i.project
        WHERE i.project.id IN :projectIds
        ORDER BY t.loggedAt DESC
        """)
    List<TimeEntry> findByProjectIdIn(@Param("projectIds") Collection<UUID> projectIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM TimeEntry t WHERE t.issue.id = :issueId")
    void deleteByIssueId(@Param("issueId") UUID issueId);
}

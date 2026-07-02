package com.scar.api.repository;

import com.scar.api.domain.entity.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    @Query("SELECT a FROM Attachment a WHERE a.issue.id = :issueId ORDER BY a.createdAt DESC")
    List<Attachment> findByIssueIdOrderByCreatedAtDesc(@Param("issueId") UUID issueId);

    @Query("""
        SELECT a FROM Attachment a
        JOIN FETCH a.issue i
        JOIN FETCH i.project
        LEFT JOIN FETCH i.createdBy
        LEFT JOIN FETCH i.assignee
        WHERE a.id = :id
        """)
    Optional<Attachment> findByIdWithIssue(@Param("id") UUID id);

    @Query("""
        SELECT a FROM Attachment a
        JOIN FETCH a.issue i
        JOIN FETCH i.project
        LEFT JOIN FETCH i.createdBy
        LEFT JOIN FETCH i.assignee
        WHERE a.fileUrl = :fileUrl
        """)
    Optional<Attachment> findByFileUrlWithIssue(@Param("fileUrl") String fileUrl);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM Attachment a WHERE a.issue.id = :issueId")
    void deleteByIssueId(@Param("issueId") UUID issueId);
}

package com.scar.api.repository;

import com.scar.api.domain.entity.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    @Query("SELECT a FROM Attachment a JOIN FETCH a.issue WHERE a.issue.id = :issueId ORDER BY a.createdAt DESC")
    List<Attachment> findByIssueIdOrderByCreatedAtDesc(UUID issueId);
}

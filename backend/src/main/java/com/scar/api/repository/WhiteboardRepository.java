package com.scar.api.repository;

import com.scar.api.domain.entity.Whiteboard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface WhiteboardRepository extends JpaRepository<Whiteboard, UUID> {

    @Query("""
        SELECT w FROM Whiteboard w
        LEFT JOIN FETCH w.project
        LEFT JOIN FETCH w.updatedBy
        WHERE (:projectId IS NULL OR w.project.id = :projectId)
        ORDER BY w.updatedAt DESC
        """)
    List<Whiteboard> findForProject(UUID projectId);
}

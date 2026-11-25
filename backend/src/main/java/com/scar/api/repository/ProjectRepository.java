package com.scar.api.repository;

import com.scar.api.domain.entity.Project;
import com.scar.api.domain.enums.ProjectType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Project p WHERE p.id = :id")
    Optional<Project> findByIdForUpdate(@Param("id") UUID id);

    @Query("SELECT DISTINCT p FROM Project p LEFT JOIN FETCH p.members ORDER BY p.createdAt")
    List<Project> findAllWithMembers();

    @Query("""
        SELECT DISTINCT p FROM Project p LEFT JOIN FETCH p.members
        WHERE :privileged = TRUE OR EXISTS (
            SELECT member.id FROM Project scoped JOIN scoped.members member WHERE scoped.id = p.id AND member.id = :userId
        )
        ORDER BY p.createdAt
        """)
    List<Project> findVisibleWithMembers(UUID userId, boolean privileged);

    @Query("""
        SELECT p.id FROM Project p WHERE :privileged = TRUE OR EXISTS (
            SELECT member.id FROM Project scoped JOIN scoped.members member WHERE scoped.id = p.id AND member.id = :userId
        )
        """)
    List<UUID> findVisibleIds(UUID userId, boolean privileged);

    Optional<Project> findByKeyCode(String keyCode);

    Optional<Project> findFirstByTypeOrderByCreatedAtAsc(ProjectType type);

    List<Project> findByParentProject_Id(UUID parentProjectId);

    @Query("SELECT COUNT(m) > 0 FROM Project p JOIN p.members m WHERE p.id = :projectId AND m.id = :userId")
    boolean existsMember(@Param("projectId") UUID projectId, @Param("userId") UUID userId);
}

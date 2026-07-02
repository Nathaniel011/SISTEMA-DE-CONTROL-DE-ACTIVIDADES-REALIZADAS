package com.scar.api.repository;

import com.scar.api.domain.entity.Project;
import com.scar.api.domain.enums.ProjectType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    @Query("SELECT DISTINCT p FROM Project p LEFT JOIN FETCH p.members ORDER BY p.createdAt")
    List<Project> findAllWithMembers();

    Optional<Project> findByKeyCode(String keyCode);

    Optional<Project> findFirstByTypeOrderByCreatedAtAsc(ProjectType type);

    List<Project> findByParentProject_Id(UUID parentProjectId);

    @Query("SELECT COUNT(m) > 0 FROM Project p JOIN p.members m WHERE p.id = :projectId AND m.id = :userId")
    boolean existsMember(@Param("projectId") UUID projectId, @Param("userId") UUID userId);
}

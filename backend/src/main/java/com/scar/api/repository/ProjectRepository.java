package com.scar.api.repository;

import com.scar.api.domain.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    @Query("SELECT DISTINCT p FROM Project p LEFT JOIN FETCH p.members WHERE p.organization.id = :orgId ORDER BY p.createdAt")
    List<Project> findByOrganizationIdWithMembers(UUID orgId);
}

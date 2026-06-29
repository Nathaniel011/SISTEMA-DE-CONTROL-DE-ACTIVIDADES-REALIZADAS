package com.scar.api.repository;

import com.scar.api.domain.entity.Label;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface LabelRepository extends JpaRepository<Label, UUID> {
    List<Label> findByOrganizationId(UUID orgId);
}

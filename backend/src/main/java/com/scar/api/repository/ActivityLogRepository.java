package com.scar.api.repository;

import com.scar.api.domain.entity.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, UUID> {
}

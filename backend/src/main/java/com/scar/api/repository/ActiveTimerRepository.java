package com.scar.api.repository;

import com.scar.api.domain.entity.ActiveTimer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ActiveTimerRepository extends JpaRepository<ActiveTimer, UUID> {}

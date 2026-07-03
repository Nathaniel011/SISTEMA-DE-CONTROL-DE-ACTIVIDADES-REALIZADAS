package com.scar.api.repository;

import com.scar.api.domain.entity.UserPreferences;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface UserPreferencesRepository extends JpaRepository<UserPreferences, UUID> {
}

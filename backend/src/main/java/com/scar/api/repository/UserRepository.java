package com.scar.api.repository;

import com.scar.api.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("SELECT u FROM User u JOIN FETCH u.roles WHERE u.organization.id = :orgId AND u.username = :username")
    Optional<User> findByOrganizationIdAndUsername(UUID orgId, String username);

    @Query("SELECT u FROM User u JOIN FETCH u.roles WHERE u.username = :username")
    Optional<User> findByUsernameWithRoles(String username);

    List<User> findByOrganizationIdAndActiveTrue(UUID orgId);
}

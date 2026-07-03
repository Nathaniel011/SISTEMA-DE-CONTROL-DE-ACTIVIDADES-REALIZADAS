package com.scar.api.repository;

import com.scar.api.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.roles WHERE u.username = :username")
    Optional<User> findByUsername(String username);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.roles WHERE LOWER(u.username) = LOWER(:identifier) OR LOWER(u.email) = LOWER(:identifier)")
    Optional<User> findByUsernameOrEmailIgnoreCase(String identifier);

    @Query("SELECT DISTINCT u FROM User u LEFT JOIN FETCH u.roles WHERE u.active = true")
    List<User> findByActiveTrue();

    @Query("SELECT DISTINCT u FROM User u LEFT JOIN FETCH u.roles ORDER BY u.fullName")
    List<User> findAllWithRoles();

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.roles WHERE u.id = :id")
    Optional<User> findByIdWithRoles(UUID id);

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    @Query("SELECT COUNT(u) > 0 FROM User u JOIN u.roles r WHERE r = com.scar.api.domain.enums.UserRole.CHIEF")
    boolean existsChief();

    @Query("SELECT COUNT(u) > 0 FROM User u JOIN u.roles r WHERE r = com.scar.api.domain.enums.UserRole.CHIEF AND u.id <> :userId")
    boolean existsOtherChief(@Param("userId") UUID userId);

    @Query("SELECT COUNT(u) > 0 FROM User u JOIN u.roles r WHERE r = com.scar.api.domain.enums.UserRole.SECRETARY")
    boolean existsSecretary();

    @Query("SELECT COUNT(u) > 0 FROM User u JOIN u.roles r WHERE r = com.scar.api.domain.enums.UserRole.SECRETARY AND u.id <> :userId")
    boolean existsOtherSecretary(@Param("userId") UUID userId);

    @Query("SELECT COUNT(DISTINCT u) FROM User u JOIN u.roles r WHERE r = com.scar.api.domain.enums.UserRole.ADMIN")
    long countAdmins();
}

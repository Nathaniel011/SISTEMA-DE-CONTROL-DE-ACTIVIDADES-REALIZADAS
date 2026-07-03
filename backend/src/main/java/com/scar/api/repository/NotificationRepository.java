package com.scar.api.repository;

import com.scar.api.domain.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    List<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId);
    long countByUserIdAndReadFlagFalse(UUID userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Notification n SET n.readFlag = true WHERE n.user.id = :userId AND n.readFlag = false")
    int markAllReadByUserId(@Param("userId") UUID userId);
}

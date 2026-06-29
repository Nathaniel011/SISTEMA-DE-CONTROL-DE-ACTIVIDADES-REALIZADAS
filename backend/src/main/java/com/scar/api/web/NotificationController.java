package com.scar.api.web;

import com.scar.api.dto.NotificationDto;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.NotificationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<NotificationDto> list(@AuthenticationPrincipal ScarPrincipal principal) {
        return notificationService.list(principal.userId());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(@AuthenticationPrincipal ScarPrincipal principal) {
        return Map.of("count", notificationService.unreadCount(principal.userId()));
    }

    @PatchMapping("/{id}/read")
    public void markRead(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        notificationService.markRead(principal.userId(), id);
    }

    @PatchMapping("/read-all")
    public void markAllRead(@AuthenticationPrincipal ScarPrincipal principal) {
        notificationService.markAllRead(principal.userId());
    }
}

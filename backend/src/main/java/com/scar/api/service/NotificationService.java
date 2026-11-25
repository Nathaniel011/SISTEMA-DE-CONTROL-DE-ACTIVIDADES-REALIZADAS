package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.Notification;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.NotificationType;
import com.scar.api.dto.NotificationDto;
import com.scar.api.repository.NotificationRepository;
import com.scar.api.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final PermissionService permissions;

    public NotificationService(NotificationRepository notificationRepository, UserRepository userRepository, PermissionService permissions) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public List<NotificationDto> list(UUID userId) {
        return visibleNotifications(userId).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return visibleNotifications(userId).stream().filter(item -> !item.isReadFlag()).count();
    }

    private List<Notification> visibleNotifications(UUID userId) {
        User user = userRepository.findByIdWithRoles(userId).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .filter(item -> item.getIssue() != null && permissions.canReadIssue(user, item.getIssue())).toList();
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId) {
        Notification n = notificationRepository.findById(notificationId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notificación no encontrada"));
        if (!n.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notificación no encontrada");
        }
        n.setReadFlag(true);
        notificationRepository.save(n);
    }

    @Transactional
    public void markAllRead(UUID userId) {
        notificationRepository.markAllReadByUserId(userId);
    }

    @Transactional
    public void notifyStatusChange(Issue issue, UUID actorId, String from, String to) {
        if (issue.getAssignee() == null || issue.getAssignee().getId().equals(actorId)) return;
        create(issue.getAssignee(), NotificationType.STATUS_CHANGE,
            "Estado actualizado: " + issueKey(issue),
            "Cambió de " + from + " a " + to,
            issue);
    }

    @Transactional
    public void notifyAssignment(Issue issue, UUID actorId) {
        if (issue.getAssignee() == null || issue.getAssignee().getId().equals(actorId)) return;
        create(issue.getAssignee(), NotificationType.ASSIGNMENT,
            "Incidencia asignada: " + issueKey(issue),
            issue.getTitle(),
            issue);
    }

    @Transactional
    public void notifyMention(Issue issue, User mentioned, User author) {
        if (mentioned.getId().equals(author.getId())) return;
        create(mentioned, NotificationType.MENTION,
            "Te mencionaron en " + issueKey(issue),
            author.getFullName() + " te mencionó en un comentario",
            issue);
    }

    private void create(User user, NotificationType type, String title, String message, Issue issue) {
        if (!user.isActive() || !permissions.canReadIssue(user, issue)) return;
        Notification n = new Notification();
        n.setUser(user);
        n.setType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setIssue(issue);
        notificationRepository.save(n);
    }

    private String issueKey(Issue issue) {
        return issue.getProject().getKeyCode() + "-" + issue.getIssueNumber();
    }

    private NotificationDto toDto(Notification n) {
        return new NotificationDto(
            n.getId().toString(),
            n.getType().name(),
            n.getTitle(),
            n.getMessage(),
            n.getIssue() != null ? n.getIssue().getId().toString() : null,
            n.isReadFlag(),
            n.getCreatedAt().toString()
        );
    }
}

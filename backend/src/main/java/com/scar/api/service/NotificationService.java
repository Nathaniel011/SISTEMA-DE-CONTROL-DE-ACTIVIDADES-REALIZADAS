package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.Notification;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.NotificationType;
import com.scar.api.dto.NotificationDto;
import com.scar.api.repository.NotificationRepository;
import com.scar.api.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    public NotificationService(NotificationRepository notificationRepository, UserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<NotificationDto> list(UUID userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFlagFalse(userId);
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId) {
        Notification n = notificationRepository.findById(notificationId).orElseThrow();
        if (!n.getUser().getId().equals(userId)) return;
        n.setReadFlag(true);
        notificationRepository.save(n);
    }

    @Transactional
    public void markAllRead(UUID userId) {
        notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).forEach(n -> {
            n.setReadFlag(true);
            notificationRepository.save(n);
        });
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

package com.scar.api.service;

import com.scar.api.domain.entity.ActivityLog;
import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.User;
import com.scar.api.dto.IssueDetailsDto.ActivityDto;
import com.scar.api.repository.ActivityLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class ActivityLogService {
    private static final Set<String> VISIBLE_FIELDS = Set.of(
        "column", "priority", "assignee", "due_date", "planned_dates", "transfer", "custom_fields", "estimate"
    );

    private final ActivityLogRepository activityLogRepository;

    public ActivityLogService(ActivityLogRepository activityLogRepository) {
        this.activityLogRepository = activityLogRepository;
    }

    @Transactional
    public void log(Issue issue, User user, String action, String oldValue, String newValue) {
        if (Objects.equals(oldValue, newValue)) {
            return;
        }
        ActivityLog entry = new ActivityLog();
        entry.setIssue(issue);
        entry.setUser(user);
        entry.setAction(action);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        activityLogRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public List<ActivityDto> issueHistory(UUID issueId) {
        return activityLogRepository.findTop100ByIssueIdAndActionInOrderByCreatedAtDescIdDesc(issueId, VISIBLE_FIELDS)
            .stream().map(entry -> new ActivityDto(
                entry.getId().toString(), entry.getUser().getFullName(), entry.getAction(),
                "transfer".equals(entry.getAction()) ? null : entry.getOldValue(),
                "transfer".equals(entry.getAction()) ? "Cambió de tablero" : entry.getNewValue(),
                entry.getCreatedAt().toString()
            )).toList();
    }
}

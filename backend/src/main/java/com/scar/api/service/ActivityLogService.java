package com.scar.api.service;

import com.scar.api.domain.entity.ActivityLog;
import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.User;
import com.scar.api.repository.ActivityLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityLogService {

    private final ActivityLogRepository activityLogRepository;

    public ActivityLogService(ActivityLogRepository activityLogRepository) {
        this.activityLogRepository = activityLogRepository;
    }

    @Transactional
    public void log(Issue issue, User user, String action, String oldValue, String newValue) {
        if (oldValue != null && oldValue.equals(newValue)) {
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
}

package com.scar.api.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_preferences")
public class UserPreferences {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "active_issue_filter", nullable = false)
    private String activeIssueFilter = "all";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getUserId() { return userId; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getActiveIssueFilter() { return activeIssueFilter; }
    public void setActiveIssueFilter(String activeIssueFilter) { this.activeIssueFilter = activeIssueFilter; }
    public Instant getUpdatedAt() { return updatedAt; }
}

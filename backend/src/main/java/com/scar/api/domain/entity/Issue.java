package com.scar.api.domain.entity;

import com.scar.api.domain.enums.*;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "issues", uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "issue_number"}))
public class Issue {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "issue_number", nullable = false)
    private int issueNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "column_id", nullable = false)
    private IssueColumn columnId;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssuePriority priority = IssuePriority.medium;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "estimate_minutes")
    private Integer estimateMinutes;

    @Column(name = "tracked_minutes", nullable = false)
    private int trackedMinutes = 0;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "requester_name")
    private String requesterName;

    @Column(name = "requester_phone")
    private String requesterPhone;

    @Column(name = "requester_email")
    private String requesterEmail;

    @Column(name = "reception_channel")
    private String receptionChannel = "manual";

    @Column(name = "public_token")
    private UUID publicToken;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "assigned_at")
    private Instant assignedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_list_id")
    private BoardList boardList;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_issue_id")
    private Issue parentIssue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdBy;

    @PrePersist
    void onCreate() {
        if (publicToken == null) {
            publicToken = UUID.randomUUID();
        }
    }

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Project getProject() { return project; }
    public void setProject(Project project) { this.project = project; }
    public int getIssueNumber() { return issueNumber; }
    public void setIssueNumber(int issueNumber) { this.issueNumber = issueNumber; }
    public IssueColumn getColumnId() { return columnId; }
    public void setColumnId(IssueColumn columnId) { this.columnId = columnId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public IssuePriority getPriority() { return priority; }
    public void setPriority(IssuePriority priority) { this.priority = priority; }
    public User getAssignee() { return assignee; }
    public void setAssignee(User assignee) { this.assignee = assignee; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
    public Integer getEstimateMinutes() { return estimateMinutes; }
    public void setEstimateMinutes(Integer estimateMinutes) { this.estimateMinutes = estimateMinutes; }
    public int getTrackedMinutes() { return trackedMinutes; }
    public void setTrackedMinutes(int trackedMinutes) { this.trackedMinutes = trackedMinutes; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getRequesterName() { return requesterName; }
    public void setRequesterName(String requesterName) { this.requesterName = requesterName; }
    public String getRequesterPhone() { return requesterPhone; }
    public void setRequesterPhone(String requesterPhone) { this.requesterPhone = requesterPhone; }
    public String getRequesterEmail() { return requesterEmail; }
    public void setRequesterEmail(String requesterEmail) { this.requesterEmail = requesterEmail; }
    public String getReceptionChannel() { return receptionChannel; }
    public void setReceptionChannel(String receptionChannel) { this.receptionChannel = receptionChannel; }
    public UUID getPublicToken() { return publicToken; }
    public void setPublicToken(UUID publicToken) { this.publicToken = publicToken; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public Instant getAssignedAt() { return assignedAt; }
    public void setAssignedAt(Instant assignedAt) { this.assignedAt = assignedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public BoardList getBoardList() { return boardList; }
    public void setBoardList(BoardList boardList) { this.boardList = boardList; }
    public Issue getParentIssue() { return parentIssue; }
    public void setParentIssue(Issue parentIssue) { this.parentIssue = parentIssue; }
    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}

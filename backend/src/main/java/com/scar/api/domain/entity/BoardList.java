package com.scar.api.domain.entity;

import com.scar.api.domain.enums.IssueColumn;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "board_lists")
public class BoardList {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(nullable = false)
    private boolean archived = false;

    @OneToMany(mappedBy = "boardList", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Issue> issues = new HashSet<>();

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
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public Set<Issue> getIssues() { return issues; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public IssueColumn issueColumn() {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.contains("hecho") || lower.contains("cerrad") || lower.contains("finaliz")
            || lower.contains("archivad") || lower.contains("completad")) return IssueColumn.done;
        if (lower.contains("progreso") || lower.contains("curso") || lower.contains("proceso")) return IssueColumn.in_progress;
        if (lower.contains("revis")) return IssueColumn.review;
        if (lower.contains("pendient")) return IssueColumn.todo;
        if (lower.contains("asign")) return IssueColumn.in_assignment;
        if (lower.contains("tarea")) return IssueColumn.todo;
        if (lower.contains("registr")) return IssueColumn.registered;
        return IssueColumn.todo;
    }
}

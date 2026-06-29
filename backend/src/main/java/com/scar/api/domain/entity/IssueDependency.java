package com.scar.api.domain.entity;

import com.scar.api.domain.enums.DependencyType;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "issue_dependencies", uniqueConstraints = @UniqueConstraint(columnNames = {"issue_id", "depends_on_issue_id"}))
public class IssueDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "issue_id", nullable = false)
    private Issue issue;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "depends_on_issue_id", nullable = false)
    private Issue dependsOnIssue;

    @Enumerated(EnumType.STRING)
    @Column(name = "dependency_type", nullable = false)
    private DependencyType dependencyType = DependencyType.FINISH_TO_START;

    public UUID getId() { return id; }
    public Issue getIssue() { return issue; }
    public void setIssue(Issue issue) { this.issue = issue; }
    public Issue getDependsOnIssue() { return dependsOnIssue; }
    public void setDependsOnIssue(Issue dependsOnIssue) { this.dependsOnIssue = dependsOnIssue; }
    public DependencyType getDependencyType() { return dependencyType; }
    public void setDependencyType(DependencyType dependencyType) { this.dependencyType = dependencyType; }
}

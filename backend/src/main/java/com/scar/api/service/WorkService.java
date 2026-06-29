package com.scar.api.service;

import com.scar.api.domain.entity.*;
import com.scar.api.domain.enums.*;
import com.scar.api.dto.*;
import com.scar.api.repository.*;
import com.scar.api.security.ScarPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class WorkService {

    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9._-]+)");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT;

    private final ProjectRepository projectRepository;
    private final IssueRepository issueRepository;
    private final LabelRepository labelRepository;
    private final UserRepository userRepository;
    private final IssueCommentRepository commentRepository;
    private final TimeEntryRepository timeEntryRepository;
    private final ActiveTimerRepository activeTimerRepository;
    private final IssueDependencyRepository dependencyRepository;
    private final NotificationService notificationService;

    public WorkService(
        ProjectRepository projectRepository,
        IssueRepository issueRepository,
        LabelRepository labelRepository,
        UserRepository userRepository,
        IssueCommentRepository commentRepository,
        TimeEntryRepository timeEntryRepository,
        ActiveTimerRepository activeTimerRepository,
        IssueDependencyRepository dependencyRepository,
        NotificationService notificationService
    ) {
        this.projectRepository = projectRepository;
        this.issueRepository = issueRepository;
        this.labelRepository = labelRepository;
        this.userRepository = userRepository;
        this.commentRepository = commentRepository;
        this.timeEntryRepository = timeEntryRepository;
        this.activeTimerRepository = activeTimerRepository;
        this.dependencyRepository = dependencyRepository;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto bootstrap(ScarPrincipal principal) {
        UUID orgId = principal.organizationId();
        List<User> members = userRepository.findByOrganizationIdAndActiveTrue(orgId);
        List<Project> projects = projectRepository.findByOrganizationIdWithMembers(orgId);
        List<Label> labels = labelRepository.findByOrganizationId(orgId);
        List<Issue> issues = issueRepository.findByOrganizationId(orgId);
        Map<UUID, List<IssueComment>> commentsByIssue = loadComments(issues);
        Map<UUID, List<TimeEntry>> timeByIssue = loadTimeEntries(issues);

        WorkBootstrapDto.ActiveTimerDto timerDto = activeTimerRepository.findById(principal.userId())
            .map(t -> new WorkBootstrapDto.ActiveTimerDto(
                t.getIssue().getId().toString(),
                t.getStartedAt().toString(),
                t.getNote()
            ))
            .orElse(null);

        return new WorkBootstrapDto(
            projects.stream().map(this::toBoard).toList(),
            issues.stream().map(i -> toCard(i, commentsByIssue, timeByIssue)).toList(),
            labels.stream().map(this::toLabel).toList(),
            members.stream().map(this::toMember).toList(),
            timerDto
        );
    }

    @Transactional
    public WorkBootstrapDto.CardDto createIssue(ScarPrincipal principal, CreateIssueRequest req) {
        Project project = projectRepository.findById(UUID.fromString(req.boardId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        assertOrg(project.getOrganization().getId(), principal.organizationId());

        int nextNum = issueRepository.findTopByProjectIdOrderByIssueNumberDesc(project.getId())
            .map(i -> i.getIssueNumber() + 1).orElse(1);
        IssueColumn column = req.columnId() != null
            ? IssueColumn.valueOf(req.columnId())
            : IssueColumn.todo;
        IssueType type = req.type() != null ? IssueType.valueOf(req.type()) : IssueType.task;

        Issue issue = new Issue();
        issue.setProject(project);
        issue.setIssueNumber(nextNum);
        issue.setType(type);
        issue.setColumnId(column);
        issue.setTitle(req.title().trim());
        issue.setSortOrder(nextIssueOrder(project.getId(), column));
        userRepository.findById(principal.userId()).ifPresent(issue::setAssignee);

        issue = issueRepository.save(issue);
        return toCard(issue, Map.of(), Map.of());
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateIssue(ScarPrincipal principal, UUID issueId, UpdateIssueRequest req) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        IssueColumn oldColumn = issue.getColumnId();

        if (req.title() != null) issue.setTitle(req.title().trim());
        if (req.description() != null) issue.setDescription(req.description());
        if (req.type() != null) issue.setType(IssueType.valueOf(req.type()));
        if (req.columnId() != null) issue.setColumnId(IssueColumn.valueOf(req.columnId()));
        if (req.priority() != null) issue.setPriority(IssuePriority.valueOf(req.priority()));
        if (req.assigneeId() != null) {
            UUID assigneeId = req.assigneeId().isBlank() ? null : UUID.fromString(req.assigneeId());
            issue.setAssignee(assigneeId == null ? null : userRepository.findById(assigneeId).orElse(null));
        }
        if (req.dueDate() != null) {
            issue.setDueDate(req.dueDate().isBlank() ? null : LocalDate.parse(req.dueDate()));
        }
        if (req.estimateMinutes() != null) issue.setEstimateMinutes(req.estimateMinutes());
        if (req.labelIds() != null) {
            Set<Label> labels = req.labelIds().stream()
                .map(id -> labelRepository.findById(UUID.fromString(id)).orElseThrow())
                .collect(Collectors.toSet());
            issue.getLabels().clear();
            issue.getLabels().addAll(labels);
        }

        issue = issueRepository.save(issue);

        if (req.columnId() != null && !oldColumn.equals(issue.getColumnId())) {
            notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), issue.getColumnId().name());
        }
        if (req.assigneeId() != null && issue.getAssignee() != null) {
            notificationService.notifyAssignment(issue, principal.userId());
        }

        return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
    }

    @Transactional
    public WorkBootstrapDto.CardDto moveIssue(ScarPrincipal principal, UUID issueId, MoveIssueRequest req) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        IssueColumn oldColumn = issue.getColumnId();
        IssueColumn newColumn = IssueColumn.valueOf(req.columnId());
        issue.setColumnId(newColumn);
        issue.setSortOrder(req.targetIndex() != null ? req.targetIndex() : nextIssueOrder(issue.getProject().getId(), newColumn));
        issue = issueRepository.save(issue);
        if (!oldColumn.equals(newColumn)) {
            notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), newColumn.name());
        }
        return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
    }

    @Transactional
    public void deleteIssue(ScarPrincipal principal, UUID issueId) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        issueRepository.delete(issue);
    }

    @Transactional
    public WorkBootstrapDto.CommentDto addComment(ScarPrincipal principal, UUID issueId, CommentRequest req) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        User author = userRepository.findById(principal.userId()).orElseThrow();
        IssueComment comment = new IssueComment();
        comment.setIssue(issue);
        comment.setAuthor(author);
        comment.setText(req.text().trim());
        comment = commentRepository.save(comment);
        processMentions(issue, req.text(), author);
        return new WorkBootstrapDto.CommentDto(
            comment.getId().toString(),
            author.getId().toString(),
            comment.getText(),
            comment.getCreatedAt().toString()
        );
    }

    @Transactional
    public WorkBootstrapDto.TimeEntryDto logTime(ScarPrincipal principal, UUID issueId, LogTimeRequest req) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        User user = userRepository.findById(principal.userId()).orElseThrow();
        TimeEntry entry = new TimeEntry();
        entry.setIssue(issue);
        entry.setUser(user);
        entry.setMinutes(req.minutes());
        entry.setNote(req.note());
        entry = timeEntryRepository.save(entry);
        issue.setTrackedMinutes(issue.getTrackedMinutes() + req.minutes());
        issueRepository.save(issue);
        return new WorkBootstrapDto.TimeEntryDto(
            entry.getId().toString(),
            user.getId().toString(),
            entry.getMinutes(),
            entry.getNote(),
            entry.getLoggedAt().toString()
        );
    }

    @Transactional
    public WorkBootstrapDto.ActiveTimerDto startTimer(ScarPrincipal principal, TimerStartRequest req) {
        activeTimerRepository.findById(principal.userId()).ifPresent(activeTimerRepository::delete);
        Issue issue = loadIssue(UUID.fromString(req.issueId()), principal.organizationId());
        User user = userRepository.findById(principal.userId()).orElseThrow();
        ActiveTimer timer = new ActiveTimer();
        timer.setUser(user);
        timer.setIssue(issue);
        timer.setStartedAt(Instant.now());
        timer.setNote(req.note());
        activeTimerRepository.save(timer);
        return new WorkBootstrapDto.ActiveTimerDto(issue.getId().toString(), timer.getStartedAt().toString(), timer.getNote());
    }

    @Transactional
    public WorkBootstrapDto.TimeEntryDto stopTimer(ScarPrincipal principal) {
        ActiveTimer timer = activeTimerRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No hay cronómetro activo"));
        long minutes = Math.max(1, (Instant.now().toEpochMilli() - timer.getStartedAt().toEpochMilli()) / 60000);
        LogTimeRequest logReq = new LogTimeRequest((int) minutes, timer.getNote() != null ? timer.getNote() : "Cronómetro");
        UUID issueId = timer.getIssue().getId();
        activeTimerRepository.delete(timer);
        return logTime(principal, issueId, logReq);
    }

    @Transactional(readOnly = true)
    public GanttDto gantt(ScarPrincipal principal, UUID projectId) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        assertOrg(project.getOrganization().getId(), principal.organizationId());
        List<Issue> issues = issueRepository.findByProjectId(projectId);
        List<IssueDependency> deps = dependencyRepository.findByProjectId(projectId);

        List<GanttDto.GanttTaskDto> tasks = issues.stream().map(i -> {
            LocalDate start = i.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
            LocalDate end = i.getDueDate() != null ? i.getDueDate() : start.plusDays(7);
            int progress = i.getColumnId() == IssueColumn.done ? 100
                : i.getColumnId() == IssueColumn.in_progress || i.getColumnId() == IssueColumn.review ? 50 : 0;
            return new GanttDto.GanttTaskDto(
                i.getId().toString(),
                project.getKeyCode() + "-" + i.getIssueNumber(),
                i.getTitle(),
                start.toString(),
                end.toString(),
                i.getColumnId().name(),
                i.getAssignee() != null ? i.getAssignee().getFullName() : null,
                progress
            );
        }).toList();

        List<GanttDto.GanttLinkDto> links = deps.stream()
            .map(d -> new GanttDto.GanttLinkDto(
                d.getId().toString(),
                d.getDependsOnIssue().getId().toString(),
                d.getIssue().getId().toString(),
                d.getDependencyType().name()
            ))
            .toList();

        return new GanttDto(tasks, links);
    }

    @Transactional
    public GanttDto.GanttLinkDto addDependency(ScarPrincipal principal, UUID issueId, DependencyRequest req) {
        Issue issue = loadIssue(issueId, principal.organizationId());
        Issue dependsOn = loadIssue(UUID.fromString(req.dependsOnIssueId()), principal.organizationId());
        if (!issue.getProject().getId().equals(dependsOn.getProject().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las dependencias deben ser del mismo proyecto");
        }
        IssueDependency dep = new IssueDependency();
        dep.setIssue(issue);
        dep.setDependsOnIssue(dependsOn);
        if (req.dependencyType() != null) {
            dep.setDependencyType(DependencyType.valueOf(req.dependencyType()));
        }
        dep = dependencyRepository.save(dep);
        return new GanttDto.GanttLinkDto(
            dep.getId().toString(),
            dependsOn.getId().toString(),
            issue.getId().toString(),
            dep.getDependencyType().name()
        );
    }

    @Transactional
    public void removeDependency(ScarPrincipal principal, UUID dependencyId) {
        IssueDependency dep = dependencyRepository.findById(dependencyId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        assertOrg(dep.getIssue().getProject().getOrganization().getId(), principal.organizationId());
        dependencyRepository.delete(dep);
    }

    private void processMentions(Issue issue, String text, User author) {
        Matcher matcher = MENTION_PATTERN.matcher(text);
        while (matcher.find()) {
            String username = matcher.group(1);
            userRepository.findByOrganizationIdAndUsername(issue.getProject().getOrganization().getId(), username)
                .ifPresent(user -> notificationService.notifyMention(issue, user, author));
        }
    }

    private int nextIssueOrder(UUID projectId, IssueColumn column) {
        return issueRepository.findByProjectIdAndColumnIdOrderBySortOrder(projectId, column).size();
    }

    private Issue loadIssue(UUID id, UUID orgId) {
        Issue issue = issueRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incidencia no encontrada"));
        assertOrg(issue.getProject().getOrganization().getId(), orgId);
        return issue;
    }

    private void assertOrg(UUID entityOrg, UUID principalOrg) {
        if (!entityOrg.equals(principalOrg)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso denegado");
        }
    }

    private Map<UUID, List<IssueComment>> loadComments(List<Issue> issues) {
        Map<UUID, List<IssueComment>> map = new HashMap<>();
        for (Issue issue : issues) {
            map.put(issue.getId(), commentRepository.findByIssueIdOrderByCreatedAtAsc(issue.getId()));
        }
        return map;
    }

    private Map<UUID, List<TimeEntry>> loadTimeEntries(List<Issue> issues) {
        Map<UUID, List<TimeEntry>> map = new HashMap<>();
        for (Issue issue : issues) {
            map.put(issue.getId(), timeEntryRepository.findByIssueIdOrderByLoggedAtDesc(issue.getId()));
        }
        return map;
    }

    private WorkBootstrapDto.BoardDto toBoard(Project p) {
        return new WorkBootstrapDto.BoardDto(
            p.getId().toString(),
            p.getName(),
            p.getDescription(),
            p.getKeyCode(),
            p.getAccent(),
            p.getMembers().stream().map(m -> m.getId().toString()).toList(),
            p.getCreatedAt().toString()
        );
    }

    private WorkBootstrapDto.MemberDto toMember(User u) {
        String role = u.getRoles().stream().findFirst().map(Enum::name).orElse("MEMBER");
        return new WorkBootstrapDto.MemberDto(
            u.getId().toString(),
            u.getFullName(),
            u.getInitials(),
            role
        );
    }

    private WorkBootstrapDto.LabelDto toLabel(Label l) {
        return new WorkBootstrapDto.LabelDto(l.getId().toString(), l.getName(), l.getColor());
    }

    private WorkBootstrapDto.CardDto toCard(
        Issue i,
        Map<UUID, List<IssueComment>> commentsByIssue,
        Map<UUID, List<TimeEntry>> timeByIssue
    ) {
        List<IssueComment> comments = commentsByIssue.getOrDefault(i.getId(), List.of());
        List<TimeEntry> times = timeByIssue.getOrDefault(i.getId(), List.of());
        return new WorkBootstrapDto.CardDto(
            i.getId().toString(),
            i.getProject().getId().toString(),
            i.getIssueNumber(),
            i.getType().name(),
            i.getColumnId().name(),
            i.getTitle(),
            i.getDescription(),
            i.getPriority().name(),
            i.getAssignee() != null ? i.getAssignee().getId().toString() : null,
            i.getLabels().stream().map(l -> l.getId().toString()).toList(),
            i.getDueDate() != null ? i.getDueDate().toString() : null,
            i.getEstimateMinutes(),
            i.getTrackedMinutes(),
            comments.stream().map(c -> new WorkBootstrapDto.CommentDto(
                c.getId().toString(),
                c.getAuthor().getId().toString(),
                c.getText(),
                c.getCreatedAt().toString()
            )).toList(),
            times.stream().map(t -> new WorkBootstrapDto.TimeEntryDto(
                t.getId().toString(),
                t.getUser().getId().toString(),
                t.getMinutes(),
                t.getNote(),
                t.getLoggedAt().toString()
            )).toList(),
            i.getSortOrder(),
            i.getCreatedAt().toString(),
            i.getUpdatedAt().toString()
        );
    }
}

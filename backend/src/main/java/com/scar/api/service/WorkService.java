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
    private final AttachmentRepository attachmentRepository;

    public WorkService(
        ProjectRepository projectRepository,
        IssueRepository issueRepository,
        LabelRepository labelRepository,
        UserRepository userRepository,
        IssueCommentRepository commentRepository,
        TimeEntryRepository timeEntryRepository,
        ActiveTimerRepository activeTimerRepository,
        IssueDependencyRepository dependencyRepository,
        NotificationService notificationService,
        AttachmentRepository attachmentRepository
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
        this.attachmentRepository = attachmentRepository;
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto bootstrap(ScarPrincipal principal) {
        List<User> members = userRepository.findByActiveTrue();
        List<Project> projects = projectRepository.findAllWithMembers();
        List<Label> labels = labelRepository.findAll();
        List<Issue> issues = issueRepository.findAll();
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
        if (principal != null) {
            userRepository.findById(principal.userId()).ifPresent(issue::setAssignee);
        }
        
        if (req.requesterName() != null) issue.setRequesterName(req.requesterName().trim());
        if (req.requesterPhone() != null) issue.setRequesterPhone(req.requesterPhone().trim());
        if (req.requesterEmail() != null) issue.setRequesterEmail(req.requesterEmail().trim());
        if (req.receptionChannel() != null) issue.setReceptionChannel(req.receptionChannel().trim());

        issue = issueRepository.save(issue);
        return toCard(issue, Map.of(), Map.of());
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateWebhookIssueDescription(UUID issueId, String description) {
        Issue issue = loadIssue(issueId);
        issue.setDescription(description);
        issue = issueRepository.save(issue);
        return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateIssue(ScarPrincipal principal, UUID issueId, UpdateIssueRequest req) {
        Issue issue = loadIssue(issueId);
        IssueColumn oldColumn = issue.getColumnId();

        if (req.title() != null) issue.setTitle(req.title().trim());
        if (req.description() != null) issue.setDescription(req.description());
        if (req.type() != null) issue.setType(IssueType.valueOf(req.type()));
        if (req.columnId() != null) issue.setColumnId(IssueColumn.valueOf(req.columnId()));
        if (req.priority() != null) issue.setPriority(IssuePriority.valueOf(req.priority()));
        if (req.assigneeId() != null) {
            UUID assigneeId = req.assigneeId().isBlank() ? null : UUID.fromString(req.assigneeId());
            User newAssignee = assigneeId == null ? null : userRepository.findById(assigneeId).orElse(null);
            User oldAssignee = issue.getAssignee();
            
            issue.setAssignee(newAssignee);
            
            // Set assignedAt when assigning to a user for the first time
            if (newAssignee != null && oldAssignee == null && issue.getAssignedAt() == null) {
                issue.setAssignedAt(Instant.now());
            }
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
        if (req.requesterName() != null) issue.setRequesterName(req.requesterName().trim());
        if (req.requesterPhone() != null) issue.setRequesterPhone(req.requesterPhone().trim());
        if (req.requesterEmail() != null) issue.setRequesterEmail(req.requesterEmail().trim());
        if (req.receptionChannel() != null) issue.setReceptionChannel(req.receptionChannel().trim());
        if (req.startDate() != null) {
            issue.setStartDate(req.startDate().isBlank() ? null : LocalDate.parse(req.startDate()));
        }
        if (req.endDate() != null) {
            issue.setEndDate(req.endDate().isBlank() ? null : LocalDate.parse(req.endDate()));
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
        Issue issue = loadIssue(issueId);
        IssueColumn oldColumn = issue.getColumnId();
        IssueColumn newColumn = IssueColumn.valueOf(req.columnId());

        // Role-based permission checks
        User user = userRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        
        Set<UserRole> roles = user.getRoles();
        
        // SECRETARY can only move between REGISTERED, IN_ASSIGNMENT and TODO
        if (roles.contains(UserRole.SECRETARY) && !roles.contains(UserRole.ADMIN) && !roles.contains(UserRole.CHIEF)) {
            if (newColumn != IssueColumn.registered && newColumn != IssueColumn.in_assignment && newColumn != IssueColumn.todo) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La Secretaría solo puede mover incidencias entre Registrada, En Asignación y Pendiente");
            }
        }

        // Cross-board move support
        if (req.targetBoardId() != null && !req.targetBoardId().isBlank() && !issue.getProject().getId().toString().equals(req.targetBoardId())) {
            UUID targetProjId = UUID.fromString(req.targetBoardId());
            Project dest = projectRepository.findById(targetProjId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto destino no encontrado"));

            // assign new project and a fresh issue number in destination
            int nextNum = issueRepository.findTopByProjectIdOrderByIssueNumberDesc(dest.getId())
                .map(i -> i.getIssueNumber() + 1).orElse(1);

            issue.setProject(dest);
            issue.setIssueNumber(nextNum);
            issue.setColumnId(newColumn);
            issue.setSortOrder(req.targetIndex() != null ? req.targetIndex() : nextIssueOrder(dest.getId(), newColumn));
            
            // Set completedAt when moving to DONE or CLOSED
            if ((newColumn == IssueColumn.done || newColumn == IssueColumn.closed) 
                && (oldColumn != IssueColumn.done && oldColumn != IssueColumn.closed)) {
                issue.setCompletedAt(Instant.now());
            }
            
            issue = issueRepository.save(issue);

            if (!oldColumn.equals(newColumn)) {
                notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), newColumn.name());
            }

            return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
        }

        // Same-project move
        issue.setColumnId(newColumn);
        issue.setSortOrder(req.targetIndex() != null ? req.targetIndex() : nextIssueOrder(issue.getProject().getId(), newColumn));
        
        // Set completedAt when moving to DONE or CLOSED
        if ((newColumn == IssueColumn.done || newColumn == IssueColumn.closed) 
            && (oldColumn != IssueColumn.done && oldColumn != IssueColumn.closed)) {
            issue.setCompletedAt(Instant.now());
        }
        
        // Reset completedAt when moving away from DONE or CLOSED
        if ((oldColumn == IssueColumn.done || oldColumn == IssueColumn.closed) 
            && (newColumn != IssueColumn.done && newColumn != IssueColumn.closed)) {
            issue.setCompletedAt(null);
        }
        
        issue = issueRepository.save(issue);

        if (!oldColumn.equals(newColumn)) {
            notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), newColumn.name());
        }

        return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
    }

    @Transactional
    public void deleteIssue(ScarPrincipal principal, UUID issueId) {
        Issue issue = loadIssue(issueId);
        issueRepository.delete(issue);
    }

    @Transactional
    public WorkBootstrapDto.CommentDto addComment(ScarPrincipal principal, UUID issueId, CommentRequest req) {
        Issue issue = loadIssue(issueId);
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
        Issue issue = loadIssue(issueId);
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
        Issue issue = loadIssue(UUID.fromString(req.issueId()));
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
        List<Issue> issues = issueRepository.findByProjectId(projectId);
        List<IssueDependency> deps = dependencyRepository.findByProjectId(projectId);

        List<GanttDto.GanttTaskDto> tasks = issues.stream()
            .map(i -> toGanttTask(i, project))
            .toList();

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
    public GanttDto.GanttTaskDto updateGanttTaskDates(ScarPrincipal principal, UUID issueId, GanttTaskUpdateRequest req) {
        Issue issue = loadIssue(issueId);
        LocalDate start = LocalDate.parse(req.start());
        LocalDate end = LocalDate.parse(req.end());
        if (end.isBefore(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha final no puede ser anterior al inicio");
        }
        issue.setStartDate(start);
        issue.setEndDate(end);
        issue.setDueDate(end);
        issue = issueRepository.save(issue);
        return toGanttTask(issue, issue.getProject());
    }

    @Transactional
    public GanttDto.GanttLinkDto addDependency(ScarPrincipal principal, UUID issueId, DependencyRequest req) {
        Issue issue = loadIssue(issueId);
        Issue dependsOn = loadIssue(UUID.fromString(req.dependsOnIssueId()));
        if (!issue.getProject().getId().equals(dependsOn.getProject().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las dependencias deben ser del mismo proyecto");
        }
        IssueDependency dep = new IssueDependency();
        dep.setIssue(issue);
        dep.setDependsOnIssue(dependsOn);
        if (req.dependencyType() != null) {
            dep.setDependencyType(DependencyType.valueOf(req.dependencyType().trim().toUpperCase(Locale.ROOT)));
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
        dependencyRepository.delete(dep);
    }

    @Transactional(readOnly = true)
    public ReportsDto getReports(ScarPrincipal principal, UUID projectId, String startDate, String endDate) {
        LocalDate start = parseReportDate(startDate);
        LocalDate end = parseReportDate(endDate);
        List<Issue> issues;
        if (projectId != null) {
            issues = issueRepository.findByProjectId(projectId);
        } else {
            issues = issueRepository.findAll();
        }
        issues = issues.stream()
            .filter(issue -> issueMatchesReportRange(issue, start, end))
            .toList();

        int totalIssues = issues.size();
        int completed = (int) issues.stream().filter(i -> i.getColumnId() == IssueColumn.done || i.getColumnId() == IssueColumn.closed).count();
        int criticalOpen = (int) issues.stream()
            .filter(i -> i.getPriority() == IssuePriority.critical && i.getColumnId() != IssueColumn.done && i.getColumnId() != IssueColumn.closed)
            .count();

        List<TimeEntry> entries = timeEntryRepository.findAll().stream()
            .filter(entry -> projectId == null || entry.getIssue().getProject().getId().equals(projectId))
            .filter(entry -> timeEntryMatchesReportRange(entry, start, end))
            .toList();

        double totalHours = entries.stream()
            .mapToInt(TimeEntry::getMinutes)
            .sum() / 60.0;

        // Group time entries by user ID for efficient lookup (avoid N+1)
        Map<UUID, Integer> minutesByUser = entries.stream()
            .collect(Collectors.groupingBy(
                e -> e.getUser().getId(),
                Collectors.summingInt(TimeEntry::getMinutes)
            ));

        List<ReportsDto.TimePerMemberDto> timePerMember = userRepository.findByActiveTrue().stream()
            .map(user -> {
                int userMinutes = minutesByUser.getOrDefault(user.getId(), 0);
                return new ReportsDto.TimePerMemberDto(
                    user.getId().toString(),
                    user.getFullName(),
                    userMinutes / 60.0
                );
            })
            .filter(dto -> dto.totalHours() > 0)
            .sorted((a, b) -> Double.compare(b.totalHours(), a.totalHours()))
            .toList();

        return new ReportsDto(
            new ReportsDto.SummaryDto(totalIssues, completed, criticalOpen, totalHours),
            timePerMember
        );
    }

    private LocalDate parseReportDate(String value) {
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
    }

    private boolean issueMatchesReportRange(Issue issue, LocalDate start, LocalDate end) {
        LocalDate created = issue.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
        return dateInRange(created, start, end);
    }

    private boolean timeEntryMatchesReportRange(TimeEntry entry, LocalDate start, LocalDate end) {
        LocalDate logged = entry.getLoggedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
        return dateInRange(logged, start, end);
    }

    private boolean dateInRange(LocalDate value, LocalDate start, LocalDate end) {
        if (start != null && value.isBefore(start)) {
            return false;
        }
        return end == null || !value.isAfter(end);
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto.CardDto getPublicTracking(String token) {
        Issue issue = issueRepository.findByPublicToken(UUID.fromString(token))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket no encontrado"));
        return toCard(issue, loadComments(List.of(issue)), loadTimeEntries(List.of(issue)));
    }

    @Transactional
    public WorkBootstrapDto.BoardDto createProject(ScarPrincipal principal, CreateProjectRequest request) {
        // Generate key from name (first 4 letters, uppercase)
        String key = request.name().trim().substring(0, Math.min(4, request.name().trim().length())).toUpperCase();
        
        // Check if key already exists, append number if needed
        String finalKey = key;
        int counter = 1;
        while (projectRepository.findByKeyCode(finalKey).isPresent()) {
            finalKey = key + counter;
            counter++;
        }

        Project project = new Project();
        project.setName(request.name().trim());
        project.setDescription(request.description() != null ? request.description().trim() : null);
        project.setKeyCode(finalKey);
        
        // Add creator as member
        User creator = userRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        project.getMembers().add(creator);
        
        project = projectRepository.save(project);
        return toBoard(project);
    }

    @Transactional
    public WorkBootstrapDto.BoardDto updateProjectMembers(UUID projectId, UpdateProjectMembersRequest request) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));

        for (UpdateProjectMembersRequest.MemberAction action : request.actions()) {
            User user = userRepository.findById(UUID.fromString(action.userId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

            if ("add".equals(action.action())) {
                if (!project.getMembers().contains(user)) {
                    project.getMembers().add(user);
                }
            } else if ("remove".equals(action.action())) {
                project.getMembers().remove(user);
            }
        }

        project = projectRepository.save(project);
        return toBoard(project);
    }

    private void processMentions(Issue issue, String text, User author) {
        Matcher matcher = MENTION_PATTERN.matcher(text);
        while (matcher.find()) {
            String username = matcher.group(1);
            userRepository.findByUsername(username)
                .ifPresent(user -> notificationService.notifyMention(issue, user, author));
        }
    }

    private int nextIssueOrder(UUID projectId, IssueColumn column) {
        return issueRepository.findByProjectIdAndColumnIdOrderBySortOrder(projectId, column).size();
    }

    private Issue loadIssue(UUID id) {
        return issueRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incidencia no encontrada"));
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

    private GanttDto.GanttTaskDto toGanttTask(Issue issue, Project project) {
        LocalDate start = issue.getStartDate() != null
            ? issue.getStartDate()
            : issue.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
        LocalDate end = issue.getEndDate() != null
            ? issue.getEndDate()
            : issue.getDueDate() != null ? issue.getDueDate() : start.plusDays(7);
        if (end.isBefore(start)) {
            end = start;
        }
        int progress = issue.getColumnId() == IssueColumn.done || issue.getColumnId() == IssueColumn.closed ? 100
            : issue.getColumnId() == IssueColumn.in_progress || issue.getColumnId() == IssueColumn.review ? 50 : 0;
        return new GanttDto.GanttTaskDto(
            issue.getId().toString(),
            project.getKeyCode() + "-" + issue.getIssueNumber(),
            issue.getTitle(),
            start.toString(),
            end.toString(),
            issue.getColumnId().name(),
            issue.getAssignee() != null ? issue.getAssignee().getFullName() : null,
            progress
        );
    }

    private WorkBootstrapDto.CardDto toCard(
        Issue i,
        Map<UUID, List<IssueComment>> commentsByIssue,
        Map<UUID, List<TimeEntry>> timeByIssue
    ) {
        List<IssueComment> comments = commentsByIssue.getOrDefault(i.getId(), List.of());
        List<TimeEntry> times = timeByIssue.getOrDefault(i.getId(), List.of());
        List<Attachment> attachments = attachmentRepository.findByIssueIdOrderByCreatedAtDesc(i.getId());
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
            i.getUpdatedAt().toString(),
            i.getRequesterName(),
            i.getRequesterPhone(),
            i.getRequesterEmail(),
            i.getReceptionChannel(),
            i.getPublicToken() != null ? i.getPublicToken().toString() : null,
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            attachments.stream().map(a -> new WorkBootstrapDto.AttachmentDto(
                a.getId().toString(),
                a.getFileName(),
                a.getFileUrl(),
                a.getMimeType(),
                a.getFileSize(),
                a.getCreatedAt().toString()
            )).toList()
        );
    }
}

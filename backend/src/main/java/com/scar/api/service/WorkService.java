package com.scar.api.service;

import com.scar.api.domain.BoardListStandard;
import com.scar.api.domain.entity.*;
import com.scar.api.domain.enums.*;
import com.scar.api.dto.*;
import com.scar.api.repository.*;
import com.scar.api.security.ScarPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.nio.file.Files;
import java.nio.file.Paths;
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
    private final UserRepository userRepository;
    private final IssueCommentRepository commentRepository;
    private final TimeEntryRepository timeEntryRepository;
    private final ActiveTimerRepository activeTimerRepository;
    private final IssueDependencyRepository dependencyRepository;
    private final NotificationService notificationService;
    private final AttachmentRepository attachmentRepository;
    private final BoardListRepository boardListRepository;
    private final PermissionService permissionService;
    private final GeneralBoardService generalBoardService;
    private final WeeklyPlanExcelService weeklyPlanExcelService;
    private final ActivityLogService activityLogService;

    @Value("${scar.upload.dir:./uploads}")
    private String uploadDir;

    public WorkService(
        ProjectRepository projectRepository,
        IssueRepository issueRepository,
        UserRepository userRepository,
        IssueCommentRepository commentRepository,
        TimeEntryRepository timeEntryRepository,
        ActiveTimerRepository activeTimerRepository,
        IssueDependencyRepository dependencyRepository,
        NotificationService notificationService,
        AttachmentRepository attachmentRepository,
        BoardListRepository boardListRepository,
        PermissionService permissionService,
        GeneralBoardService generalBoardService,
        WeeklyPlanExcelService weeklyPlanExcelService,
        ActivityLogService activityLogService
    ) {
        this.projectRepository = projectRepository;
        this.issueRepository = issueRepository;
        this.userRepository = userRepository;
        this.commentRepository = commentRepository;
        this.timeEntryRepository = timeEntryRepository;
        this.activeTimerRepository = activeTimerRepository;
        this.dependencyRepository = dependencyRepository;
        this.notificationService = notificationService;
        this.attachmentRepository = attachmentRepository;
        this.boardListRepository = boardListRepository;
        this.permissionService = permissionService;
        this.generalBoardService = generalBoardService;
        this.weeklyPlanExcelService = weeklyPlanExcelService;
        this.activityLogService = activityLogService;
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto bootstrap(ScarPrincipal principal) {
        return bootstrap(principal, "all", null);
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto bootstrap(ScarPrincipal principal, String cardsMode, UUID boardId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        List<User> members = userRepository.findByActiveTrue();
        List<Project> allProjects = projectRepository.findAllWithMembers();
        List<Project> projects = allProjects.stream()
            .filter(p -> permissionService.canAccessProject(currentUser, p))
            .toList();
        Set<UUID> accessibleProjectIds = projects.stream().map(Project::getId).collect(Collectors.toSet());

        List<Issue> issues = resolveBootstrapIssues(currentUser, cardsMode, boardId, accessibleProjectIds);
        List<BoardList> boardLists = boardListRepository
            .findByProjectIdInAndArchivedFalseOrderBySortOrderAsc(accessibleProjectIds);

        Map<UUID, List<IssueComment>> commentsByIssue = issues.isEmpty()
            ? Map.of()
            : loadComments(issues);

        WorkBootstrapDto.ActiveTimerDto timerDto = activeTimerRepository.findById(principal.userId())
            .map(t -> new WorkBootstrapDto.ActiveTimerDto(
                t.getIssue().getId().toString(),
                t.getStartedAt().toString(),
                t.getNote()
            ))
            .orElse(null);

        return new WorkBootstrapDto(
            projects.stream().map(this::toBoard).toList(),
            boardLists.stream().map(this::toBoardListDto).toList(),
            issues.stream().map(i -> toCardSummary(i, commentsByIssue)).toList(),
            members.stream().map(this::toMember).toList(),
            timerDto
        );
    }

    @Transactional(readOnly = true)
    public List<WorkBootstrapDto.CardDto> getProjectCards(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        permissionService.requireAccessProject(currentUser, project);

        List<Issue> issues = issueRepository.findByProjectId(projectId);
        Map<UUID, List<IssueComment>> commentsByIssue = loadComments(issues);
        return issues.stream().map(i -> toCardSummary(i, commentsByIssue)).toList();
    }

    @Transactional(readOnly = true)
    public DashboardDto getDashboard(ScarPrincipal principal, UUID projectId, String startDate, String endDate) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Set<UUID> accessibleProjectIds = projectRepository.findAllWithMembers().stream()
            .filter(project -> permissionService.canAccessProject(currentUser, project))
            .map(Project::getId)
            .collect(Collectors.toSet());

        LocalDate start = parseReportDate(startDate);
        LocalDate end = parseReportDate(endDate);
        List<Issue> issues;
        Set<UUID> dashboardProjectIds;
        if (projectId != null) {
            Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
            permissionService.requireAccessProject(currentUser, project);
            issues = issueRepository.findByProjectId(projectId);
            dashboardProjectIds = Set.of(projectId);
        } else if (accessibleProjectIds.isEmpty()) {
            issues = List.of();
            dashboardProjectIds = Set.of();
        } else {
            issues = issueRepository.findByProjectIdIn(accessibleProjectIds);
            dashboardProjectIds = accessibleProjectIds;
        }
        issues = issues.stream()
            .filter(issue -> issueMatchesReportRange(issue, start, end))
            .toList();

        int total = issues.size();
        int open = (int) issues.stream()
            .filter(i -> i.getColumnId() != IssueColumn.done && i.getColumnId() != IssueColumn.closed)
            .count();
        int inProgress = (int) issues.stream()
            .filter(i -> i.getColumnId() == IssueColumn.in_progress || i.getColumnId() == IssueColumn.review)
            .count();
        int done = (int) issues.stream()
            .filter(i -> i.getColumnId() == IssueColumn.done || i.getColumnId() == IssueColumn.closed)
            .count();
        int unassigned = (int) issues.stream().filter(i -> i.getAssignee() == null).count();
        int critical = (int) issues.stream().filter(i -> i.getPriority() == IssuePriority.critical).count();
        int trackedMinutes = (start != null || end != null)
            ? loadTrackedMinutesForDashboard(dashboardProjectIds, start, end)
            : issues.stream().mapToInt(Issue::getTrackedMinutes).sum();

        int pending = (int) issues.stream()
            .filter(i -> i.getColumnId() == IssueColumn.backlog || i.getColumnId() == IssueColumn.todo)
            .count();
        int high = (int) issues.stream().filter(i -> i.getPriority() == IssuePriority.high).count();
        int normal = (int) issues.stream()
            .filter(i -> i.getPriority() == IssuePriority.medium || i.getPriority() == IssuePriority.low)
            .count();

        return new DashboardDto(
            total,
            open,
            inProgress,
            done,
            unassigned,
            critical,
            trackedMinutes,
            List.of(
                new DashboardDto.ChartItemDto("Pendiente", pending),
                new DashboardDto.ChartItemDto("En curso", inProgress),
                new DashboardDto.ChartItemDto("Hecho", done)
            ),
            List.of(
                new DashboardDto.ChartItemDto("Crítico", critical),
                new DashboardDto.ChartItemDto("Mayor", high),
                new DashboardDto.ChartItemDto("Normal", normal)
            )
        );
    }

    private int loadTrackedMinutesForDashboard(Set<UUID> projectIds, LocalDate start, LocalDate end) {
        if (projectIds.isEmpty()) {
            return 0;
        }
        return timeEntryRepository.findByProjectIdIn(projectIds).stream()
            .filter(entry -> timeEntryMatchesReportRange(entry, start, end))
            .mapToInt(TimeEntry::getMinutes)
            .sum();
    }

    private List<Issue> resolveBootstrapIssues(
        User currentUser,
        String cardsMode,
        UUID boardId,
        Set<UUID> accessibleProjectIds
    ) {
        if ("none".equalsIgnoreCase(cardsMode)) {
            return List.of();
        }
        if ("board".equalsIgnoreCase(cardsMode)) {
            if (boardId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "boardId es obligatorio cuando cards=board");
            }
            Project project = projectRepository.findById(boardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
            permissionService.requireAccessProject(currentUser, project);
            return issueRepository.findByProjectId(boardId);
        }
        if (accessibleProjectIds.isEmpty()) {
            return List.of();
        }
        return issueRepository.findByProjectIdIn(accessibleProjectIds);
    }

    @Transactional(readOnly = true)
    public List<TimeEntryWithIssueDto> listTimeEntries(ScarPrincipal principal) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Set<UUID> accessibleProjectIds = projectRepository.findAllWithMembers().stream()
            .filter(project -> permissionService.canAccessProject(currentUser, project))
            .map(Project::getId)
            .collect(Collectors.toSet());

        if (accessibleProjectIds.isEmpty()) {
            return List.of();
        }
        return timeEntryRepository.findByProjectIdIn(accessibleProjectIds).stream()
            .map(entry -> new TimeEntryWithIssueDto(
                entry.getId().toString(),
                entry.getIssue().getId().toString(),
                entry.getUser().getId().toString(),
                entry.getMinutes(),
                entry.getNote(),
                entry.getLoggedAt().toString()
            ))
            .toList();
    }

    @Transactional(readOnly = true)
    public IssueDetailsDto getIssueDetails(ScarPrincipal principal, UUID issueId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(currentUser, issue.getProject());
        return new IssueDetailsDto(
            mapComments(commentRepository.findByIssueIdWithAuthorOrderByCreatedAtAsc(issueId)),
            mapTimeEntries(timeEntryRepository.findByIssueIdOrderByLoggedAtDesc(issueId)),
            mapAttachments(attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId))
        );
    }

    @Transactional
    public WorkBootstrapDto.CardDto createIssue(ScarPrincipal principal, CreateIssueRequest req) {
        User currentUser = principal != null
            ? userRepository.findByIdWithRoles(principal.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"))
            : null;

        IssueColumn column = req.columnId() != null
            ? IssueColumn.valueOf(req.columnId())
            : IssueColumn.todo;
        boolean incoming = isIncomingRequest(req, column);
        Project project;

        if (incoming) {
            project = generalBoardService.ensureGeneralBoardExists();
            column = IssueColumn.registered;
        } else {
            project = projectRepository.findById(UUID.fromString(req.boardId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        }

        if (currentUser != null) {
            permissionService.requireCreateIssue(currentUser, project);
        }

        int nextNum = issueRepository.findTopByProjectIdOrderByIssueNumberDesc(project.getId())
            .map(i -> i.getIssueNumber() + 1).orElse(1);

        Issue issue = new Issue();
        issue.setProject(project);
        issue.setIssueNumber(nextNum);
        issue.setColumnId(column);
        issue.setTitle(req.title().trim());
        issue.setCreatedBy(currentUser);

        User assignee = null;
        if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            if (!permissionService.canAssignTasks(currentUser)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede asignar tareas a otras personas");
            }
            assignee = userRepository.findByIdWithRoles(UUID.fromString(req.assigneeId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Responsable no encontrado"));
            permissionService.requireValidAssignee(currentUser, assignee);
        } else if (currentUser != null && permissionService.isStaff(currentUser)
            && !permissionService.isAdminOrChief(currentUser)
            && !permissionService.isSecretary(currentUser)) {
            assignee = currentUser;
        }

        boolean explicitList = req.boardListId() != null && !req.boardListId().isBlank();
        if (!incoming && !explicitList) {
            column = assignee != null ? IssueColumn.in_assignment : IssueColumn.todo;
            issue.setColumnId(column);
        }

        BoardList targetList = resolveBoardList(project.getId(), req.boardListId(), column);
        if (incoming && targetList == null) {
            targetList = generalBoardService.findReceivedList(project).orElse(null);
        }
        if (targetList != null) {
            issue.setBoardList(targetList);
            issue.setSortOrder(nextIssueListOrder(project.getId(), targetList.getId()));
            column = mapColumnFromList(targetList);
            issue.setColumnId(column);
        } else {
            issue.setSortOrder(nextIssueOrder(project.getId(), column));
        }

        if (req.parentIssueId() != null && !req.parentIssueId().isBlank()) {
            Issue parent = loadIssue(UUID.fromString(req.parentIssueId()));
            permissionService.requireAccessProject(currentUser, parent.getProject());
            issue.setParentIssue(parent);
            if (issue.getBoardList() == null && parent.getBoardList() != null) {
                issue.setBoardList(parent.getBoardList());
            }
        }

        if (assignee != null) {
            issue.setAssignee(assignee);
            issue.setAssignedAt(Instant.now());
        }

        if (req.requesterName() != null) issue.setRequesterName(req.requesterName().trim());
        if (req.requesterPhone() != null) issue.setRequesterPhone(req.requesterPhone().trim());
        if (req.requesterEmail() != null) issue.setRequesterEmail(req.requesterEmail().trim());
        if (req.receptionChannel() != null) issue.setReceptionChannel(req.receptionChannel().trim());

        issue = issueRepository.save(issue);
        return toCard(issue);
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateWebhookIssueDescription(UUID issueId, String description) {
        Issue issue = loadIssue(issueId);
        issue.setDescription(description);
        issue = issueRepository.save(issue);
        return toCard(issue);
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateIssue(ScarPrincipal principal, UUID issueId, UpdateIssueRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(currentUser, issue.getProject());
        permissionService.requireUpdateIssue(currentUser, issue, req.assigneeId());
        IssueColumn oldColumn = issue.getColumnId();

        if (req.title() != null && !req.title().trim().equals(issue.getTitle())) {
            activityLogService.log(issue, currentUser, "title", issue.getTitle(), req.title().trim());
            issue.setTitle(req.title().trim());
        }
        if (req.description() != null && !Objects.equals(req.description(), issue.getDescription())) {
            activityLogService.log(issue, currentUser, "description", issue.getDescription(), req.description());
            issue.setDescription(req.description());
        }
        if (req.columnId() != null) {
            IssueColumn newColumn = IssueColumn.valueOf(req.columnId());
            if (!newColumn.equals(issue.getColumnId())) {
                activityLogService.log(issue, currentUser, "column", issue.getColumnId().name(), newColumn.name());
            }
            issue.setColumnId(newColumn);
        }
        if (req.boardListId() != null && !req.boardListId().isBlank()) {
            BoardList list = boardListRepository.findByIdAndProjectId(
                UUID.fromString(req.boardListId()), issue.getProject().getId()
            ).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));
            issue.setBoardList(list);
            issue.setColumnId(mapColumnFromList(list));
            applyCompletionFromList(issue, list, oldColumn);
        }
        if (req.priority() != null) {
            if (!req.priority().equals(issue.getPriority().name())) {
                activityLogService.log(issue, currentUser, "priority", issue.getPriority().name(), req.priority());
            }
            issue.setPriority(IssuePriority.valueOf(req.priority()));
        }
        if (req.assigneeId() != null) {
            if (!req.assigneeId().isBlank() && !permissionService.canAssignTasks(currentUser)) {
                UUID assigneeId = UUID.fromString(req.assigneeId());
                UUID currentId = issue.getAssignee() != null ? issue.getAssignee().getId() : null;
                if (!assigneeId.equals(currentUser.getId()) && !assigneeId.equals(currentId)) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede asignar tareas a otras personas");
                }
            }
            UUID assigneeId = req.assigneeId().isBlank() ? null : UUID.fromString(req.assigneeId());
            User newAssignee = assigneeId == null ? null : userRepository.findByIdWithRoles(assigneeId).orElse(null);
            if (newAssignee != null) {
                permissionService.requireValidAssignee(currentUser, newAssignee);
            }
            User oldAssignee = issue.getAssignee();

            issue.setAssignee(newAssignee);

            String oldAssigneeLabel = oldAssignee != null ? oldAssignee.getFullName() : null;
            String newAssigneeLabel = newAssignee != null ? newAssignee.getFullName() : null;
            if (!Objects.equals(oldAssigneeLabel, newAssigneeLabel)) {
                activityLogService.log(issue, currentUser, "assignee", oldAssigneeLabel, newAssigneeLabel);
            }

            if (newAssignee != null && (oldAssignee == null || !oldAssignee.getId().equals(newAssignee.getId()))) {
                issue.setAssignedAt(Instant.now());
            }
            if (newAssignee == null) {
                issue.setAssignedAt(null);
            }
        }
        if (req.dueDate() != null) {
            issue.setDueDate(req.dueDate().isBlank() ? null : LocalDate.parse(req.dueDate()));
        }
        if (req.estimateMinutes() != null) issue.setEstimateMinutes(req.estimateMinutes());
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
        if (req.issueType() != null) {
            String newType = req.issueType().isBlank() ? null : req.issueType().trim();
            if (!Objects.equals(issue.getIssueType(), newType)) {
                activityLogService.log(issue, currentUser, "issue_type", issue.getIssueType(), newType);
            }
            issue.setIssueType(newType);
        }
        if (req.observations() != null) {
            issue.setObservations(req.observations().isBlank() ? null : req.observations().trim());
        }

        issue = issueRepository.save(issue);

        if (req.columnId() != null && !oldColumn.equals(issue.getColumnId())) {
            notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), issue.getColumnId().name());
        }
        if (req.assigneeId() != null && issue.getAssignee() != null) {
            notificationService.notifyAssignment(issue, principal.userId());
        }

        return toCardLight(issue);
    }

    @Transactional
    public WorkBootstrapDto.CardDto moveIssue(ScarPrincipal principal, UUID issueId, MoveIssueRequest req) {
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(user, issue.getProject());

        IssueColumn oldColumn = issue.getColumnId();
        BoardList oldList = issue.getBoardList();
        IssueColumn newColumn = oldColumn;
        BoardList newList = oldList;

        boolean crossBoard = req.targetBoardId() != null && !req.targetBoardId().isBlank()
            && !issue.getProject().getId().toString().equals(req.targetBoardId());

        if (req.boardListId() != null && !req.boardListId().isBlank()) {
            UUID listProjectId = crossBoard
                ? UUID.fromString(req.targetBoardId())
                : issue.getProject().getId();
            newList = boardListRepository.findByIdAndProjectId(
                UUID.fromString(req.boardListId()),
                listProjectId
            ).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));
            newColumn = mapColumnFromList(newList);
        } else if (req.columnId() != null && !req.columnId().isBlank()) {
            newColumn = IssueColumn.valueOf(req.columnId());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debe indicar columna o lista destino");
        }

        permissionService.requireMoveIssue(user, issue, newColumn);

        if (crossBoard) {
            UUID targetProjId = UUID.fromString(req.targetBoardId());
            Project dest = projectRepository.findById(targetProjId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto destino no encontrado"));
            permissionService.requireAccessProject(user, dest);

            int nextNum = issueRepository.findTopByProjectIdOrderByIssueNumberDesc(dest.getId())
                .map(i -> i.getIssueNumber() + 1).orElse(1);

            BoardList targetList = resolveBoardList(dest.getId(), req.boardListId(), newColumn);
            if (targetList != null) {
                newList = targetList;
                newColumn = mapColumnFromList(targetList);
            }

            issue.setProject(dest);
            issue.setIssueNumber(nextNum);
            issue.setColumnId(newColumn);
            issue.setBoardList(newList);
            issue.setSortOrder(req.targetIndex() != null ? req.targetIndex()
                : (newList != null
                    ? nextIssueListOrder(dest.getId(), newList.getId())
                    : nextIssueOrder(dest.getId(), newColumn)));
            applyCompletionState(issue, oldColumn, newColumn, oldList, newList);
            issue = issueRepository.save(issue);

            if (!oldColumn.equals(newColumn)) {
                activityLogService.log(issue, user, "column", oldColumn.name(), newColumn.name());
                notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), newColumn.name());
            }
            return toCardLight(issue);
        }

        issue.setColumnId(newColumn);
        if (newList != null) {
            issue.setBoardList(newList);
            issue.setSortOrder(req.targetIndex() != null ? req.targetIndex() : nextIssueListOrder(issue.getProject().getId(), newList.getId()));
        } else {
            issue.setSortOrder(req.targetIndex() != null ? req.targetIndex() : nextIssueOrder(issue.getProject().getId(), newColumn));
        }

        applyCompletionState(issue, oldColumn, newColumn, oldList, newList);
        issue = issueRepository.save(issue);

        if (!oldColumn.equals(newColumn)) {
            activityLogService.log(issue, user, "column", oldColumn.name(), newColumn.name());
            notificationService.notifyStatusChange(issue, principal.userId(), oldColumn.name(), newColumn.name());
        }
        return toCardLight(issue);
    }

    @Transactional
    public void deleteIssue(ScarPrincipal principal, UUID issueId) {
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireDeleteIssue(user, issue);
        deleteIssueTree(issue);
    }

    private void deleteIssueTree(Issue issue) {
        UUID issueId = issue.getId();
        for (Issue child : issueRepository.findByParentIssueId(issueId)) {
            deleteIssueTree(child);
        }
        deleteAttachmentFiles(issueId);
        activeTimerRepository.deleteByIssueId(issueId);
        commentRepository.deleteByIssueId(issueId);
        timeEntryRepository.deleteByIssueId(issueId);
        attachmentRepository.deleteByIssueId(issueId);
        dependencyRepository.deleteAllForIssue(issueId);
        issueRepository.delete(issue);
    }

    private void deleteAttachmentFiles(UUID issueId) {
        for (Attachment attachment : attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId)) {
            try {
                String fileUrl = attachment.getFileUrl();
                if (fileUrl != null && fileUrl.startsWith("/api/files/")) {
                    String filename = fileUrl.substring("/api/files/".length());
                    Files.deleteIfExists(Paths.get(uploadDir, filename));
                }
            } catch (Exception ignored) {
                // ignorar archivos huérfanos o bloqueados
            }
        }
    }

    @Transactional
    public WorkBootstrapDto.CommentDto addComment(ScarPrincipal principal, UUID issueId, CommentRequest req) {
        User author = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(author, issue.getProject());
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
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(user, issue.getProject());
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
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        activeTimerRepository.findById(principal.userId()).ifPresent(activeTimerRepository::delete);
        Issue issue = loadIssue(UUID.fromString(req.issueId()));
        permissionService.requireAccessProject(user, issue.getProject());
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
    public GanttDto ganttAll(ScarPrincipal principal) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        List<Project> projects = projectRepository.findAllWithMembers().stream()
            .filter(project -> permissionService.canAccessProject(currentUser, project))
            .filter(project -> !isGeneralProject(project))
            .sorted(Comparator.comparing(Project::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return buildHierarchicalGantt(projects, true);
    }

    @Transactional(readOnly = true)
    public GanttDto gantt(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireAccessProject(currentUser, project);
        return buildHierarchicalGantt(List.of(project), false);
    }

    private GanttDto buildHierarchicalGantt(List<Project> projects, boolean includeProjectSections) {
        if (projects.isEmpty()) {
            LocalDate today = LocalDate.now();
            return new GanttDto(today.toString(), today.plusDays(7).toString(), "7d", true, List.of(), List.of());
        }

        Set<UUID> projectIds = projects.stream().map(Project::getId).collect(Collectors.toSet());
        List<Issue> allIssues = issueRepository.findByProjectIdIn(projectIds);
        Map<UUID, List<Issue>> issuesByProject = allIssues.stream()
            .collect(Collectors.groupingBy(i -> i.getProject().getId()));
        Map<UUID, List<Issue>> childrenByParent = allIssues.stream()
            .filter(i -> i.getParentIssue() != null)
            .collect(Collectors.groupingBy(i -> i.getParentIssue().getId()));

        List<GanttDto.GanttTaskDto> rows = new ArrayList<>();
        for (Project project : projects) {
            String projectSectionId = "section-project-" + project.getId();
            List<Issue> projectIssues = issuesByProject.getOrDefault(project.getId(), List.of());
            DateRange projectRange = dateRangeForIssues(projectIssues);

            if (includeProjectSections) {
                rows.add(sectionRow(
                    "PROJECT",
                    projectSectionId,
                    null,
                    project.getKeyCode(),
                    project.getName(),
                    projectRange,
                    project.getId().toString(),
                    null
                ));
            }

            String listParentId = includeProjectSections ? projectSectionId : null;
            List<BoardList> lists = boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(project.getId());
            Map<UUID, List<Issue>> issuesByList = projectIssues.stream()
                .filter(i -> i.getBoardList() != null)
                .collect(Collectors.groupingBy(i -> i.getBoardList().getId()));

            Set<UUID> issuesInLists = issuesByList.values().stream()
                .flatMap(List::stream)
                .map(Issue::getId)
                .collect(Collectors.toSet());

            for (BoardList list : lists) {
                appendListSection(rows, project, list, issuesByList.getOrDefault(list.getId(), List.of()),
                    listParentId, childrenByParent);
            }

            List<Issue> unlisted = projectIssues.stream()
                .filter(i -> i.getBoardList() == null)
                .toList();
            if (!unlisted.isEmpty()) {
                appendListSection(rows, project, null, unlisted, listParentId, childrenByParent);
            }
        }

        List<IssueDependency> deps = dependencyRepository.findByProjectIdIn(projectIds);
        List<GanttDto.GanttLinkDto> links = deps.stream()
            .map(d -> new GanttDto.GanttLinkDto(
                d.getId().toString(),
                d.getDependsOnIssue().getId().toString(),
                d.getIssue().getId().toString(),
                d.getDependencyType().name()
            ))
            .toList();

        LocalDate minStart = allIssues.stream().map(this::resolveTaskStart).min(LocalDate::compareTo)
            .orElse(LocalDate.now());
        LocalDate maxEnd = allIssues.stream().map(this::resolveTaskEnd).max(LocalDate::compareTo)
            .orElse(minStart.plusDays(7));

        return new GanttDto(
            minStart.toString(),
            maxEnd.toString(),
            formatDurationLabel(minStart, maxEnd),
            true,
            rows,
            links
        );
    }

    private void appendListSection(
        List<GanttDto.GanttTaskDto> rows,
        Project project,
        BoardList list,
        List<Issue> listIssues,
        String listParentId,
        Map<UUID, List<Issue>> childrenByParent
    ) {
        if (listIssues.isEmpty()) {
            return;
        }
        String listSectionId = list != null
            ? "section-list-" + list.getId()
            : "section-list-none-" + project.getId();
        String listName = list != null ? list.getName() : "Sin lista";
        DateRange listRange = dateRangeForIssues(listIssues);

        rows.add(sectionRow(
            "LIST",
            listSectionId,
            listParentId,
            "",
            listName,
            listRange,
            project.getId().toString(),
            list != null ? list.getId().toString() : null
        ));

        Set<UUID> listIssueIds = listIssues.stream().map(Issue::getId).collect(Collectors.toSet());
        List<Issue> roots = listIssues.stream()
            .filter(i -> i.getParentIssue() == null || !listIssueIds.contains(i.getParentIssue().getId()))
            .sorted(Comparator.comparingInt(Issue::getSortOrder).thenComparingInt(Issue::getIssueNumber))
            .toList();

        for (Issue root : roots) {
            appendIssueTree(rows, root, listSectionId, project, childrenByParent);
        }
    }

    private void appendIssueTree(
        List<GanttDto.GanttTaskDto> rows,
        Issue issue,
        String parentId,
        Project project,
        Map<UUID, List<Issue>> childrenByParent
    ) {
        List<Issue> children = childrenByParent.getOrDefault(issue.getId(), List.of()).stream()
            .sorted(Comparator.comparingInt(Issue::getSortOrder).thenComparingInt(Issue::getIssueNumber))
            .toList();
        rows.add(toGanttTask(issue, project, !children.isEmpty(), parentId));
        for (Issue child : children) {
            appendIssueTree(rows, child, issue.getId().toString(), project, childrenByParent);
        }
    }

    private GanttDto.GanttTaskDto sectionRow(
        String rowType,
        String id,
        String parentId,
        String key,
        String title,
        DateRange range,
        String projectId,
        String boardListId
    ) {
        return new GanttDto.GanttTaskDto(
            id,
            key,
            title,
            range.start().toString(),
            range.end().toString(),
            "backlog",
            null,
            0,
            parentId,
            null,
            "medium",
            "FEATURE",
            title,
            null,
            true,
            rowType,
            projectId,
            boardListId
        );
    }

    private DateRange dateRangeForIssues(List<Issue> issues) {
        if (issues.isEmpty()) {
            LocalDate today = LocalDate.now();
            return new DateRange(today, today.plusDays(1));
        }
        LocalDate start = issues.stream().map(this::resolveTaskStart).min(LocalDate::compareTo).orElse(LocalDate.now());
        LocalDate end = issues.stream().map(this::resolveTaskEnd).max(LocalDate::compareTo).orElse(start);
        return new DateRange(start, end);
    }

    private record DateRange(LocalDate start, LocalDate end) {}

    @Transactional
    public GanttDto recalculateGantt(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireAccessProject(currentUser, project);

        List<Issue> issues = issueRepository.findByProjectId(projectId);
        List<IssueDependency> deps = dependencyRepository.findByProjectId(projectId);
        Map<UUID, Issue> byId = issues.stream().collect(Collectors.toMap(Issue::getId, i -> i));

        boolean changed;
        int guard = 0;
        do {
            changed = false;
            for (IssueDependency dep : deps) {
                Issue successor = byId.get(dep.getIssue().getId());
                Issue predecessor = byId.get(dep.getDependsOnIssue().getId());
                if (successor == null || predecessor == null) {
                    continue;
                }
                LocalDate predStart = resolveTaskStart(predecessor);
                LocalDate predEnd = resolveTaskEnd(predecessor);
                LocalDate succStart = resolveTaskStart(successor);
                LocalDate succEnd = resolveTaskEnd(successor);
                long durationDays = Math.max(1, java.time.temporal.ChronoUnit.DAYS.between(succStart, succEnd));

                LocalDate nextStart = switch (dep.getDependencyType()) {
                    case START_TO_START -> predStart;
                    case FINISH_TO_START -> predEnd.plusDays(1);
                };
                if (nextStart.isAfter(succStart)) {
                    successor.setStartDate(nextStart);
                    successor.setEndDate(nextStart.plusDays(durationDays));
                    successor.setDueDate(successor.getEndDate());
                    changed = true;
                }
            }
            guard++;
        } while (changed && guard < 50);

        issueRepository.saveAll(issues);
        return gantt(principal, projectId);
    }

    @Transactional(readOnly = true)
    public WeeklyPlanDto getWeeklyPlan(ScarPrincipal principal, UUID projectId, String weekStartParam) {
        LocalDate weekStart = parseWeekStart(weekStartParam);
        LocalDate weekEnd = weekStart.plusDays(6);
        boolean groupedByProject = projectId == null;

        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        Set<UUID> projectIds = projectRepository.findAllWithMembers().stream()
            .filter(project -> permissionService.canAccessProject(currentUser, project))
            .filter(project -> projectId == null || project.getId().equals(projectId))
            .filter(project -> !groupedByProject || !isGeneralProject(project))
            .map(Project::getId)
            .collect(Collectors.toSet());

        Map<UUID, Project> projectsById = projectRepository.findAllWithMembers().stream()
            .filter(project -> projectIds.contains(project.getId()))
            .collect(Collectors.toMap(Project::getId, project -> project, (a, b) -> a));

        if (projectIds.isEmpty()) {
            return new WeeklyPlanDto(weekStart.toString(), weekEnd.toString(), groupedByProject, List.of());
        }

        List<Issue> issues = issueRepository.findByProjectIdIn(projectIds).stream()
            .filter(issue -> overlapsWeek(issue, weekStart, weekEnd))
            .sorted(Comparator
                .comparing((Issue i) -> i.getProject().getName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparing(Issue::getStartDate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Issue::getIssueNumber))
            .toList();

        Map<String, List<Issue>> byProject = new LinkedHashMap<>();
        for (Issue issue : issues) {
            String projectName = issue.getProject().getName();
            byProject.computeIfAbsent(projectName, key -> new ArrayList<>()).add(issue);
        }

        List<WeeklyPlanDto.WeeklyPlanGroupDto> groups = new ArrayList<>();
        int index = 1;
        for (Map.Entry<String, List<Issue>> entry : byProject.entrySet()) {
            List<WeeklyPlanDto.WeeklyPlanRowDto> rows = new ArrayList<>();
            for (Issue issue : entry.getValue()) {
                LocalDate overlapStart = clampToBusinessDay(overlapStart(issue, weekStart, weekEnd));
                LocalDate overlapEnd = clampToBusinessDay(overlapEnd(issue, weekStart, weekEnd));
                if (overlapEnd.isBefore(overlapStart)) {
                    overlapEnd = overlapStart;
                }
                rows.add(new WeeklyPlanDto.WeeklyPlanRowDto(
                    index++,
                    issue.getProject().getKeyCode() + "-" + issue.getIssueNumber(),
                    issue.getProject().getName(),
                    issue.getTitle(),
                    resolveMembersLabel(issue, projectsById),
                    spanishDayName(overlapStart),
                    spanishDayName(overlapEnd),
                    priorityLabel(issue.getPriority()),
                    issue.getIssueType() != null ? issue.getIssueType() : "",
                    issue.getObservations() != null && !issue.getObservations().isBlank()
                        ? issue.getObservations()
                        : (issue.getDescription() != null ? issue.getDescription() : "")
                ));
            }
            groups.add(new WeeklyPlanDto.WeeklyPlanGroupDto(entry.getKey(), rows));
        }

        return new WeeklyPlanDto(weekStart.toString(), weekEnd.toString(), groupedByProject, groups);
    }

    private boolean isGeneralProject(Project project) {
        return project.getType() == ProjectType.GENERAL
            || GeneralBoardService.GENERAL_BOARD_KEY.equalsIgnoreCase(project.getKeyCode())
            || GeneralBoardService.GENERAL_BOARD_NAME.equalsIgnoreCase(project.getName());
    }

    @Transactional(readOnly = true)
    public byte[] exportWeeklyPlanExcel(ScarPrincipal principal, UUID projectId, String weekStartParam) {
        WeeklyPlanDto plan = getWeeklyPlan(principal, projectId, weekStartParam);
        return weeklyPlanExcelService.export(plan);
    }

    public String weeklyPlanFileName(String weekStartParam) {
        return weeklyPlanExcelService.fileName(parseWeekStart(weekStartParam));
    }

    @Transactional
    public GanttDto.GanttTaskDto updateGanttTaskDates(ScarPrincipal principal, UUID issueId, GanttTaskUpdateRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(currentUser, issue.getProject());
        LocalDate start = LocalDate.parse(req.start());
        LocalDate end = LocalDate.parse(req.end());
        if (end.isBefore(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha final no puede ser anterior al inicio");
        }
        issue.setStartDate(start);
        issue.setEndDate(end);
        issue.setDueDate(end);
        issue = issueRepository.save(issue);
        return toGanttTask(issue, issue.getProject(), issueRepository.findByParentIssueId(issue.getId()).size() > 0, null);
    }

    @Transactional
    public GanttDto.GanttLinkDto addDependency(ScarPrincipal principal, UUID issueId, DependencyRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireAccessProject(currentUser, issue.getProject());
        Issue dependsOn = loadIssue(UUID.fromString(req.dependsOnIssueId()));
        permissionService.requireAccessProject(currentUser, dependsOn.getProject());
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
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        IssueDependency dep = dependencyRepository.findById(dependencyId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireAccessProject(currentUser, dep.getIssue().getProject());
        dependencyRepository.delete(dep);
    }

    @Transactional(readOnly = true)
    public ReportsDto getReports(ScarPrincipal principal, UUID projectId, String startDate, String endDate) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Set<UUID> accessibleProjectIds = projectRepository.findAllWithMembers().stream()
            .filter(project -> permissionService.canAccessProject(currentUser, project))
            .map(Project::getId)
            .collect(Collectors.toSet());

        LocalDate start = parseReportDate(startDate);
        LocalDate end = parseReportDate(endDate);
        List<Issue> issues;
        if (projectId != null) {
            Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
            permissionService.requireAccessProject(currentUser, project);
            issues = issueRepository.findByProjectId(projectId);
        } else if (accessibleProjectIds.isEmpty()) {
            issues = List.of();
        } else {
            issues = issueRepository.findByProjectIdIn(accessibleProjectIds);
        }
        issues = issues.stream()
            .filter(issue -> issueMatchesReportRange(issue, start, end))
            .toList();

        int totalIssues = issues.size();
        int completed = (int) issues.stream().filter(i -> i.getColumnId() == IssueColumn.done || i.getColumnId() == IssueColumn.closed).count();
        int criticalOpen = (int) issues.stream()
            .filter(i -> i.getPriority() == IssuePriority.critical && i.getColumnId() != IssueColumn.done && i.getColumnId() != IssueColumn.closed)
            .count();

        Set<UUID> reportProjectIds = projectId != null
            ? Set.of(projectId)
            : accessibleProjectIds;
        List<TimeEntry> entries = reportProjectIds.isEmpty()
            ? List.of()
            : timeEntryRepository.findByProjectIdIn(reportProjectIds).stream()
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
        UUID publicToken;
        try {
            publicToken = UUID.fromString(token);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket no encontrado");
        }
        Issue issue = issueRepository.findByPublicToken(publicToken)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket no encontrado"));
        return toPublicCard(issue);
    }

    @Transactional
    public WorkBootstrapDto.BoardDto createProject(ScarPrincipal principal, CreateProjectRequest request) {
        User creator = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        permissionService.requireCreateBoard(creator);

        String key = request.name().trim().substring(0, Math.min(4, request.name().trim().length())).toUpperCase();
        String finalKey = key;
        int counter = 1;
        while (projectRepository.findByKeyCode(finalKey).isPresent()) {
            finalKey = key + counter;
            counter++;
        }

        ProjectType type = ProjectType.STANDARD;
        if (request.type() != null && !request.type().isBlank()) {
            type = ProjectType.valueOf(request.type().trim().toUpperCase(Locale.ROOT));
        }

        Project project = new Project();
        project.setName(request.name().trim());
        project.setDescription(request.description() != null ? request.description().trim() : null);
        project.setKeyCode(finalKey);
        project.setType(type);

        if (request.parentBoardId() != null && !request.parentBoardId().isBlank()) {
            Project parent = projectRepository.findById(UUID.fromString(request.parentBoardId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero padre no encontrado"));
            permissionService.requireAccessProject(creator, parent);
            project.setParentProject(parent);
        }

        project.getMembers().add(creator);
        project = projectRepository.save(project);
        createDefaultLists(project);
        return toBoard(project);
    }

    @Transactional
    public void deleteProject(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        permissionService.requireDeleteBoard(currentUser);

        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero no encontrado"));

        if (project.getType() == ProjectType.GENERAL
            || GeneralBoardService.GENERAL_BOARD_KEY.equalsIgnoreCase(project.getKeyCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se puede eliminar el tablero general");
        }

        deleteProjectCascade(projectId);
    }

    private void deleteProjectCascade(UUID projectId) {
        for (Project child : projectRepository.findByParentProject_Id(projectId)) {
            deleteProjectCascade(child.getId());
        }
        projectRepository.deleteById(projectId);
    }

    @Transactional
    public WorkBootstrapDto.BoardDto updateProjectMembers(ScarPrincipal principal, UUID projectId, UpdateProjectMembersRequest request) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        permissionService.requireManageBoardMembers(currentUser);
        return updateProjectMembersInternal(projectId, request, currentUser);
    }

    private WorkBootstrapDto.BoardDto updateProjectMembersInternal(UUID projectId, UpdateProjectMembersRequest request, User currentUser) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        permissionService.requireAccessProject(currentUser, project);

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
        return (int) issueRepository.countByProjectIdAndColumnId(projectId, column);
    }

    private int nextIssueListOrder(UUID projectId, UUID listId) {
        return (int) issueRepository.countByProjectIdAndBoardListId(projectId, listId);
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto.BoardDto getGeneralBoard(ScarPrincipal principal) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project general = generalBoardService.findGeneralBoard()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero general no configurado"));
        permissionService.requireAccessProject(currentUser, general);
        return toBoard(general);
    }

    private boolean isIncomingRequest(CreateIssueRequest req, IssueColumn column) {
        if (column == IssueColumn.registered) {
            return true;
        }
        return req.receptionChannel() != null && !req.receptionChannel().isBlank();
    }

    private void createDefaultLists(Project project) {
        BoardList list = new BoardList();
        list.setProject(project);
        list.setName(BoardListStandard.TASK_LIST_NAME);
        list.setSortOrder(0);
        list.setArchived(false);
        boardListRepository.save(list);
    }

    private BoardList resolveBoardList(UUID projectId, String boardListId, IssueColumn fallbackColumn) {
        if (boardListId != null && !boardListId.isBlank()) {
            return boardListRepository.findByIdAndProjectId(UUID.fromString(boardListId), projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));
        }
        List<BoardList> lists = boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(projectId);
        if (lists.isEmpty()) {
            return null;
        }
        String targetName = switch (fallbackColumn) {
            case done, closed -> BoardListStandard.NAMES.get(3);
            case in_progress, review -> BoardListStandard.NAMES.get(1);
            case in_assignment -> BoardListStandard.NAMES.get(0);
            case registered -> BoardListStandard.NAMES.get(0);
            default -> BoardListStandard.TASK_LIST_NAME;
        };
        return findListByName(lists, targetName)
            .or(() -> findListByName(lists, BoardListStandard.TASK_LIST_NAME))
            .orElseGet(() -> switch (fallbackColumn) {
            case done, closed -> lists.get(lists.size() - 1);
            case in_progress, review -> lists.get(Math.min(1, lists.size() - 1));
            default -> lists.get(0);
        });
    }

    private Optional<BoardList> findListByName(List<BoardList> lists, String name) {
        return lists.stream()
            .filter(list -> list.getName().equalsIgnoreCase(name))
            .findFirst()
            .or(() -> lists.stream()
                .filter(list -> list.getName().toLowerCase(Locale.ROOT).contains(name.toLowerCase(Locale.ROOT)))
                .findFirst());
    }

    private IssueColumn mapColumnFromList(BoardList list) {
        if (isDoneList(list)) {
            return IssueColumn.done;
        }
        String name = list.getName().toLowerCase(Locale.ROOT);
        if (name.contains("progreso") || name.contains("curso") || name.contains("proceso")) {
            return IssueColumn.in_progress;
        }
        if (name.contains("revis")) {
            return IssueColumn.review;
        }
        if (name.contains("pendient")) {
            return IssueColumn.todo;
        }
        if (name.contains("asign")) {
            return IssueColumn.in_assignment;
        }
        if (name.contains("tarea")) {
            return IssueColumn.todo;
        }
        if (name.contains("registr")) {
            return IssueColumn.registered;
        }
        return IssueColumn.todo;
    }

    private boolean isDoneList(BoardList list) {
        if (list == null) {
            return false;
        }
        String name = list.getName().toLowerCase(Locale.ROOT);
        return name.contains("hecho") || name.contains("cerrad") || name.contains("finaliz")
            || name.contains("archivad") || name.contains("completad");
    }

    private void applyCompletionFromList(Issue issue, BoardList list, IssueColumn oldColumn) {
        if (isDoneList(list)) {
            if (issue.getCompletedAt() == null) {
                issue.setCompletedAt(Instant.now());
            }
            issue.setColumnId(IssueColumn.done);
        } else if (oldColumn == IssueColumn.done || oldColumn == IssueColumn.closed) {
            issue.setCompletedAt(null);
        }
    }

    private void applyCompletionState(
        Issue issue,
        IssueColumn oldColumn,
        IssueColumn newColumn,
        BoardList oldList,
        BoardList newList
    ) {
        boolean wasDone = oldColumn == IssueColumn.done || oldColumn == IssueColumn.closed || isDoneList(oldList);
        boolean nowDone = newColumn == IssueColumn.done || newColumn == IssueColumn.closed || isDoneList(newList);
        if (nowDone && !wasDone) {
            issue.setCompletedAt(Instant.now());
        } else if (wasDone && !nowDone) {
            issue.setCompletedAt(null);
        }
    }

    private BoardListDto toBoardListDto(BoardList list) {
        return new BoardListDto(
            list.getId(),
            list.getProject().getId(),
            list.getName(),
            list.getSortOrder(),
            list.isArchived(),
            list.getCreatedAt(),
            list.getUpdatedAt()
        );
    }

    private Issue loadIssue(UUID id) {
        return issueRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incidencia no encontrada"));
    }

    private Map<UUID, List<IssueComment>> loadComments(List<Issue> issues) {
        if (issues.isEmpty()) {
            return Map.of();
        }
        Set<UUID> issueIds = issues.stream().map(Issue::getId).collect(Collectors.toSet());
        return commentRepository.findByIssueIdInOrderByCreatedAtAsc(issueIds).stream()
            .collect(Collectors.groupingBy(comment -> comment.getIssue().getId()));
    }

    private List<WorkBootstrapDto.CommentDto> mapComments(List<IssueComment> comments) {
        return comments.stream().map(c -> new WorkBootstrapDto.CommentDto(
            c.getId().toString(),
            c.getAuthor().getId().toString(),
            c.getText(),
            c.getCreatedAt().toString()
        )).toList();
    }

    private List<WorkBootstrapDto.TimeEntryDto> mapTimeEntries(List<TimeEntry> entries) {
        return entries.stream().map(t -> new WorkBootstrapDto.TimeEntryDto(
            t.getId().toString(),
            t.getUser().getId().toString(),
            t.getMinutes(),
            t.getNote(),
            t.getLoggedAt().toString()
        )).toList();
    }

    private List<WorkBootstrapDto.AttachmentDto> mapAttachments(List<Attachment> attachments) {
        return attachments.stream().map(a -> new WorkBootstrapDto.AttachmentDto(
            a.getId().toString(),
            a.getFileName(),
            a.getFileUrl(),
            a.getMimeType(),
            a.getFileSize(),
            a.getCreatedAt().toString()
        )).toList();
    }

    private WorkBootstrapDto.BoardDto toBoard(Project p) {
        return new WorkBootstrapDto.BoardDto(
            p.getId().toString(),
            p.getName(),
            p.getDescription(),
            p.getKeyCode(),
            p.getAccent(),
            p.getMembers().stream().map(m -> m.getId().toString()).toList(),
            p.getType().name().toLowerCase(Locale.ROOT),
            p.getParentProject() != null ? p.getParentProject().getId().toString() : null,
            p.getCreatedAt().toString()
        );
    }

    private WorkBootstrapDto.MemberDto toMember(User u) {
        List<String> roles = u.getRoles().stream().map(Enum::name).toList();
        String role = roles.isEmpty() ? "STAFF" : roles.get(0);
        return new WorkBootstrapDto.MemberDto(
            u.getId().toString(),
            u.getFullName(),
            u.getInitials(),
            role,
            roles
        );
    }

    private GanttDto.GanttTaskDto toGanttTask(Issue issue, Project project, boolean hasChildren, String parentId) {
        LocalDate start = resolveTaskStart(issue);
        LocalDate end = resolveTaskEnd(issue);
        int progress = issue.getColumnId() == IssueColumn.done || issue.getColumnId() == IssueColumn.closed ? 100
            : issue.getColumnId() == IssueColumn.in_progress || issue.getColumnId() == IssueColumn.review ? 50 : 0;
        String boardListId = issue.getBoardList() != null ? issue.getBoardList().getId().toString() : null;
        return new GanttDto.GanttTaskDto(
            issue.getId().toString(),
            project.getKeyCode() + "-" + issue.getIssueNumber(),
            issue.getTitle(),
            start.toString(),
            end.toString(),
            issue.getColumnId().name(),
            issue.getAssignee() != null ? issue.getAssignee().getFullName() : null,
            progress,
            parentId,
            issue.getEstimateMinutes(),
            issue.getPriority().name(),
            issue.getIssueType() != null ? issue.getIssueType() : "",
            project.getName(),
            issue.getObservations(),
            hasChildren,
            "TASK",
            project.getId().toString(),
            boardListId
        );
    }

    private LocalDate resolveTaskStart(Issue issue) {
        if (issue.getStartDate() != null) {
            return issue.getStartDate();
        }
        return issue.getCreatedAt().atZone(java.time.ZoneOffset.UTC).toLocalDate();
    }

    private LocalDate resolveTaskEnd(Issue issue) {
        if (issue.getEndDate() != null) {
            return issue.getEndDate();
        }
        if (issue.getDueDate() != null) {
            return issue.getDueDate();
        }
        LocalDate start = resolveTaskStart(issue);
        if (issue.getEstimateMinutes() != null && issue.getEstimateMinutes() > 0) {
            int days = Math.max(1, (int) Math.ceil(issue.getEstimateMinutes() / (8.0 * 60)));
            return start.plusDays(days - 1L);
        }
        return start.plusDays(7);
    }

    private boolean overlapsWeek(Issue issue, LocalDate weekStart, LocalDate weekEnd) {
        LocalDate start = resolveTaskStart(issue);
        LocalDate end = resolveTaskEnd(issue);
        return !end.isBefore(weekStart) && !start.isAfter(weekEnd);
    }

    private LocalDate overlapStart(Issue issue, LocalDate weekStart, LocalDate weekEnd) {
        return resolveTaskStart(issue).isBefore(weekStart) ? weekStart : resolveTaskStart(issue);
    }

    private LocalDate overlapEnd(Issue issue, LocalDate weekStart, LocalDate weekEnd) {
        return resolveTaskEnd(issue).isAfter(weekEnd) ? weekEnd : resolveTaskEnd(issue);
    }

    private String resolveMembersLabel(Issue issue) {
        return resolveMembersLabel(issue, null);
    }

    private String resolveMembersLabel(Issue issue, Map<UUID, Project> projectsById) {
        if (issue.getAssignee() != null) {
            return issue.getAssignee().getFullName();
        }
        Project project = projectsById != null
            ? projectsById.getOrDefault(issue.getProject().getId(), issue.getProject())
            : issue.getProject();
        if (project.getMembers() != null && !project.getMembers().isEmpty()) {
            return project.getMembers().stream()
                .map(User::getFullName)
                .sorted()
                .collect(Collectors.joining(", "));
        }
        return "Sin asignar";
    }

    private String publicTokenValue(Issue issue) {
        UUID token = issue.getPublicToken();
        return token != null ? token.toString() : null;
    }

    private LocalDate clampToBusinessDay(LocalDate date) {
        return switch (date.getDayOfWeek()) {
            case SATURDAY -> date.minusDays(1);
            case SUNDAY -> date.plusDays(1);
            default -> date;
        };
    }

    private String spanishDayName(LocalDate date) {
        String day = date.format(DateTimeFormatter.ofPattern("EEEE", new Locale("es", "ES")));
        if (day.isEmpty()) return day;
        return day.substring(0, 1).toUpperCase(Locale.ROOT) + day.substring(1);
    }

    private String priorityLabel(IssuePriority priority) {
        return switch (priority) {
            case high, critical -> "Alta";
            case medium -> "Media";
            case low -> "Baja";
        };
    }

    private LocalDate parseWeekStart(String weekStartParam) {
        if (weekStartParam == null || weekStartParam.isBlank()) {
            LocalDate today = LocalDate.now();
            return today.minusDays(today.getDayOfWeek().getValue() - 1L);
        }
        return LocalDate.parse(weekStartParam);
    }

    private String formatDurationLabel(LocalDate start, LocalDate end) {
        long totalDays = java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1;
        long weeks = totalDays / 7;
        long days = totalDays % 7;
        if (weeks > 0 && days > 0) {
            return weeks + "s " + days + "d";
        }
        if (weeks > 0) {
            return weeks + "s";
        }
        return days + "d";
    }

    private String issueTypeValue(Issue issue) {
        return issue.getIssueType() != null ? issue.getIssueType() : "";
    }

    private WorkBootstrapDto.CardDto toCardSummary(
        Issue i,
        Map<UUID, List<IssueComment>> commentsByIssue
    ) {
        List<IssueComment> comments = commentsByIssue.getOrDefault(i.getId(), List.of());
        return new WorkBootstrapDto.CardDto(
            i.getId().toString(),
            i.getProject().getId().toString(),
            i.getBoardList() != null ? i.getBoardList().getId().toString() : null,
            i.getParentIssue() != null ? i.getParentIssue().getId().toString() : null,
            i.getIssueNumber(),
            i.getColumnId().name(),
            i.getTitle(),
            i.getDescription(),
            i.getPriority().name(),
            i.getAssignee() != null ? i.getAssignee().getId().toString() : null,
            i.getDueDate() != null ? i.getDueDate().toString() : null,
            i.getEstimateMinutes(),
            i.getTrackedMinutes(),
            mapComments(comments),
            List.of(),
            i.getSortOrder(),
            i.getCreatedAt().toString(),
            i.getUpdatedAt().toString(),
            i.getAssignedAt() != null ? i.getAssignedAt().toString() : null,
            i.getCompletedAt() != null ? i.getCompletedAt().toString() : null,
            i.getRequesterName(),
            i.getRequesterPhone(),
            i.getRequesterEmail(),
            i.getReceptionChannel(),
            publicTokenValue(i),
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            List.of()
        );
    }

    private WorkBootstrapDto.CardDto toPublicCard(Issue i) {
        return new WorkBootstrapDto.CardDto(
            i.getId().toString(),
            i.getProject().getId().toString(),
            i.getBoardList() != null ? i.getBoardList().getId().toString() : null,
            null,
            i.getIssueNumber(),
            i.getColumnId().name(),
            i.getTitle(),
            i.getDescription(),
            i.getPriority().name(),
            null,
            i.getDueDate() != null ? i.getDueDate().toString() : null,
            i.getEstimateMinutes(),
            i.getTrackedMinutes(),
            List.of(),
            List.of(),
            i.getSortOrder(),
            i.getCreatedAt().toString(),
            i.getUpdatedAt().toString(),
            i.getAssignedAt() != null ? i.getAssignedAt().toString() : null,
            i.getCompletedAt() != null ? i.getCompletedAt().toString() : null,
            null,
            null,
            null,
            null,
            null,
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            List.of()
        );
    }

    private WorkBootstrapDto.CardDto toCardLight(Issue i) {
        return new WorkBootstrapDto.CardDto(
            i.getId().toString(),
            i.getProject().getId().toString(),
            i.getBoardList() != null ? i.getBoardList().getId().toString() : null,
            i.getParentIssue() != null ? i.getParentIssue().getId().toString() : null,
            i.getIssueNumber(),
            i.getColumnId().name(),
            i.getTitle(),
            i.getDescription(),
            i.getPriority().name(),
            i.getAssignee() != null ? i.getAssignee().getId().toString() : null,
            i.getDueDate() != null ? i.getDueDate().toString() : null,
            i.getEstimateMinutes(),
            i.getTrackedMinutes(),
            List.of(),
            List.of(),
            i.getSortOrder(),
            i.getCreatedAt().toString(),
            i.getUpdatedAt().toString(),
            i.getAssignedAt() != null ? i.getAssignedAt().toString() : null,
            i.getCompletedAt() != null ? i.getCompletedAt().toString() : null,
            i.getRequesterName(),
            i.getRequesterPhone(),
            i.getRequesterEmail(),
            i.getReceptionChannel(),
            publicTokenValue(i),
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            List.of()
        );
    }

    private WorkBootstrapDto.CardDto toCard(Issue i) {
        UUID issueId = i.getId();
        return new WorkBootstrapDto.CardDto(
            issueId.toString(),
            i.getProject().getId().toString(),
            i.getBoardList() != null ? i.getBoardList().getId().toString() : null,
            i.getParentIssue() != null ? i.getParentIssue().getId().toString() : null,
            i.getIssueNumber(),
            i.getColumnId().name(),
            i.getTitle(),
            i.getDescription(),
            i.getPriority().name(),
            i.getAssignee() != null ? i.getAssignee().getId().toString() : null,
            i.getDueDate() != null ? i.getDueDate().toString() : null,
            i.getEstimateMinutes(),
            i.getTrackedMinutes(),
            mapComments(commentRepository.findByIssueIdWithAuthorOrderByCreatedAtAsc(issueId)),
            mapTimeEntries(timeEntryRepository.findByIssueIdOrderByLoggedAtDesc(issueId)),
            i.getSortOrder(),
            i.getCreatedAt().toString(),
            i.getUpdatedAt().toString(),
            i.getAssignedAt() != null ? i.getAssignedAt().toString() : null,
            i.getCompletedAt() != null ? i.getCompletedAt().toString() : null,
            i.getRequesterName(),
            i.getRequesterPhone(),
            i.getRequesterEmail(),
            i.getReceptionChannel(),
            publicTokenValue(i),
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            mapAttachments(attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId))
        );
    }
}

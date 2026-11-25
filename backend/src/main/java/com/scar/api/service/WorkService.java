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
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class WorkService {

    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9._-]+)");
    private static final Pattern ISSUE_REFERENCE = Pattern.compile("([A-Z0-9][A-Z0-9_-]{0,30})-([0-9]{1,9})");
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
    private final HelpdeskSlaService helpdeskSla;
    private final ProjectConfigurationService configuration;

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
        ActivityLogService activityLogService,
        HelpdeskSlaService helpdeskSla,
        ProjectConfigurationService configuration
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
        this.helpdeskSla = helpdeskSla;
        this.configuration = configuration;
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
        List<Project> projects = visibleProjects(currentUser);
        Set<UUID> accessibleProjectIds = projects.stream().map(Project::getId).collect(Collectors.toSet());

        List<Issue> issues = readableIssues(currentUser, resolveBootstrapIssues(currentUser, cardsMode, boardId, accessibleProjectIds));
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
            boardLists.stream().map(BoardListDto::from).toList(),
            issues.stream().map(i -> toCardSummary(i, commentsByIssue)).toList(),
            members.stream().map(this::toMember).toList(),
            timerDto,
            issues.stream()
                .filter(issue -> permissionService.canMoveAccessibleIssue(currentUser, issue))
                .map(issue -> issue.getId().toString())
                .toList(),
            boardLists.stream().collect(Collectors.toMap(
                list -> list.getId().toString(), list -> list.issueColumn().name()
            )),
            configuration.workflows(accessibleProjectIds)
        );
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto.ProjectCardsDto getProjectCards(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        permissionService.requireAccessProject(currentUser, project);

        List<Issue> issues = readableIssues(currentUser, issueRepository.findByProjectId(projectId));
        Map<UUID, List<IssueComment>> commentsByIssue = loadComments(issues);
        return new WorkBootstrapDto.ProjectCardsDto(
            issues.stream().map(issue -> toCardSummary(issue, commentsByIssue)).toList(),
            issues.stream().filter(issue -> permissionService.canMoveAccessibleIssue(currentUser, issue))
                .map(issue -> issue.getId().toString()).toList()
        );
    }

    @Transactional(readOnly = true)
    public DashboardDto getDashboard(ScarPrincipal principal, UUID projectId, String startDate, String endDate) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Set<UUID> accessibleProjectIds = visibleProjectIds(currentUser);

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
        issues = readableIssues(currentUser, issues).stream()
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
            ? loadTrackedMinutesForDashboard(currentUser, dashboardProjectIds, start, end)
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

    private int loadTrackedMinutesForDashboard(User currentUser, Set<UUID> projectIds, LocalDate start, LocalDate end) {
        if (projectIds.isEmpty()) {
            return 0;
        }
        return timeEntryRepository.findByProjectIdIn(projectIds).stream()
            .filter(entry -> permissionService.canReadProjectIssue(currentUser, entry.getIssue()))
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
        Set<UUID> accessibleProjectIds = visibleProjectIds(currentUser);

        if (accessibleProjectIds.isEmpty()) {
            return List.of();
        }
        return timeEntryRepository.findByProjectIdIn(accessibleProjectIds).stream()
            .filter(entry -> permissionService.canReadProjectIssue(currentUser, entry.getIssue()))
            .map(entry -> new TimeEntryWithIssueDto(
                entry.getId().toString(),
                entry.getIssue().getId().toString(),
                entry.getUser().getId().toString(),
                entry.getIssue().getProject().getId().toString(),
                entry.getIssue().getProject().getName(),
                entry.getIssue().getProject().getKeyCode(),
                entry.getIssue().getIssueNumber(),
                entry.getIssue().getTitle(),
                entry.getIssue().getIssueType(),
                entry.getMinutes(),
                entry.getActivityType(),
                entry.getNote(),
                entry.getLoggedAt().toString()
            ))
            .toList();
    }

    @Transactional(readOnly = true)
    public WorkBootstrapDto.CardDto getIssue(ScarPrincipal principal, String reference) {
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        UUID stableId = null;
        try {
            stableId = UUID.fromString(reference);
        } catch (IllegalArgumentException ignored) {
            // Public references also accept the readable identifier.
        }
        Issue issue;
        if (stableId != null) {
            issue = loadIssue(stableId);
        } else {
            Matcher match = ISSUE_REFERENCE.matcher(reference.toUpperCase(Locale.ROOT));
            if (!match.matches()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            issue = issueRepository.findByProject_KeyCodeAndIssueNumber(match.group(1), Integer.parseInt(match.group(2)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        }
        if (!permissionService.canReadIssue(user, issue)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return toCardLight(issue);
    }

    @Transactional(readOnly = true)
    public IssueDetailsDto getIssueDetails(ScarPrincipal principal, UUID issueId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireReadIssue(currentUser, issue);
        return new IssueDetailsDto(
            mapComments(commentRepository.findByIssueIdWithAuthorOrderByCreatedAtAsc(issueId)),
            mapTimeEntries(timeEntryRepository.findByIssueIdOrderByLoggedAtDesc(issueId)),
            mapAttachments(attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId)),
            activityLogService.issueHistory(issueId),
            configuration.fieldValues(issue),
            permissionService.canMoveAccessibleIssue(currentUser, issue)
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
            if (req.boardId() != null && !req.boardId().isBlank()) {
                project = projectRepository.findById(UUID.fromString(req.boardId()))
                    .orElseGet(generalBoardService::ensureGeneralBoardExists);
            } else {
                project = generalBoardService.ensureGeneralBoardExists();
            }
            column = IssueColumn.registered;
        } else {
            project = projectRepository.findById(UUID.fromString(req.boardId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        }

        if (currentUser != null) {
            permissionService.requireCreateIssue(currentUser, project);
            if (incoming && !permissionService.canAssignTasks(currentUser)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede registrar solicitudes para terceros");
            }
        }

        int nextNum = nextIssueNumber(project.getId());

        Issue issue = new Issue();
        issue.setProject(project);
        issue.setIssueNumber(nextNum);
        issue.setColumnId(column);
        issue.setTitle(req.title().trim());
        issue.setDescription(req.description() == null ? null : req.description().strip());
        issue.setHelpdeskRequest(incoming);
        issue.setCreatedBy(currentUser);

        User assignee = null;
        if (req.assigneeId() != null && !req.assigneeId().isBlank()) {
            if (currentUser == null || !permissionService.canAssignTasks(currentUser)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede asignar tareas a otras personas");
            }
            assignee = userRepository.findByIdWithRoles(UUID.fromString(req.assigneeId()))
                .filter(User::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Responsable no encontrado"));
            permissionService.requireValidAssignee(currentUser, assignee);
            permissionService.requireAccessProject(assignee, project);
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
            column = incoming ? IssueColumn.registered : targetList.issueColumn();
            issue.setColumnId(column);
        } else {
            issue.setSortOrder(nextIssueOrder(project.getId(), column));
        }

        if (req.parentIssueId() != null && !req.parentIssueId().isBlank()) {
            if (currentUser == null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No se puede vincular incidencia padre sin usuario");
            }
            Issue parent = loadIssue(UUID.fromString(req.parentIssueId()));
            permissionService.requireReadIssue(currentUser, parent);
            if (!parent.getProject().getId().equals(project.getId()) || parent.isHelpdeskRequest()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La incidencia padre debe ser una tarea del mismo tablero");
            }
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
        if (req.customFields() != null && !req.customFields().isEmpty()) {
            issueRepository.flush();
            configuration.saveFieldValues(issue, currentUser, req.customFields(), false);
        }
        return toCard(issue);
    }

    @Transactional
    public HelpdeskDto.Receipt submitPublicRequest(HelpdeskDto.Submission request) {
        Project general = generalBoardService.findGeneralBoard()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        projectRepository.findByIdForUpdate(general.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        Issue existing = issueRepository.findBySubmissionKey(request.requestId()).orElse(null);
        String email = request.email().strip().toLowerCase(Locale.ROOT);
        if (existing != null) {
            if (!Objects.equals(existing.getRequesterEmail(), email) || !existing.isPublicTrackingEnabled()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT);
            }
            return new HelpdeskDto.Receipt(publicReference(existing), existing.getPublicToken());
        }

        var card = createIssue(null, new CreateIssueRequest(general.getId().toString(), request.title(),
            IssueColumn.registered.name(), null, null, null, request.name(), null, email, "web", request.description()));
        Issue issue = loadIssue(UUID.fromString(card.id()));
        issue.setSubmissionKey(request.requestId());
        issue.setPublicTrackingEnabled(true);
        return new HelpdeskDto.Receipt(publicReference(issue), issue.getPublicToken());
    }

    @Transactional
    public WorkBootstrapDto.CardDto updateIssue(ScarPrincipal principal, UUID issueId, UpdateIssueRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssueForUpdate(issueId);
        permissionService.requireReadIssue(currentUser, issue);
        permissionService.requireUpdateIssue(currentUser, issue, req.assigneeId());
        IssueColumn oldColumn = issue.getColumnId();
        BoardList oldList = issue.getBoardList();
        BoardList newList = oldList;
        IssueColumn newColumn = req.columnId() == null ? oldColumn : parseIssueColumn(req.columnId());
        if (req.boardListId() != null && !req.boardListId().isBlank()
            && (oldList == null || !oldList.getId().toString().equals(req.boardListId()))) {
            newList = requireActiveIssueList(issue.getProject().getId(), req.boardListId());
            newColumn = newList.issueColumn();
            if (req.columnId() != null && newColumn != parseIssueColumn(req.columnId())) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La lista no corresponde al estado destino");
            }
        } else if (newColumn != oldColumn) {
            newList = listForState(issue.getProject().getId(), newColumn);
        }
        if (oldList != newList || oldColumn != newColumn) {
            permissionService.requireMoveIssue(currentUser, issue);
            configuration.requireTransition(issue.getProject().getId(), oldColumn, newColumn);
            issue.setBoardList(newList);
            issue.setColumnId(newColumn);
            applyCompletionState(issue, oldColumn, newColumn, oldList, newList);
            if (oldColumn != newColumn) {
                activityLogService.log(issue, currentUser, "column", oldColumn.name(), newColumn.name());
            }
        }

        if (req.title() != null && req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El asunto es obligatorio");
        }
        if (req.title() != null && !req.title().trim().equals(issue.getTitle())) {
            activityLogService.log(issue, currentUser, "title", issue.getTitle(), req.title().trim());
            issue.setTitle(req.title().trim());
        }
        if (req.description() != null && !Objects.equals(req.description(), issue.getDescription())) {
            activityLogService.log(issue, currentUser, "description", issue.getDescription(), req.description());
            issue.setDescription(req.description());
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
            User newAssignee = assigneeId == null ? null : userRepository.findByIdWithRoles(assigneeId)
                .filter(User::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Responsable no encontrado"));
            if (newAssignee != null) {
                permissionService.requireValidAssignee(currentUser, newAssignee);
                permissionService.requireAccessProject(newAssignee, issue.getProject());
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
            LocalDate dueDate = parseOptionalIssueDate(req.dueDate());
            activityLogService.log(issue, currentUser, "due_date",
                issue.getDueDate() == null ? null : issue.getDueDate().toString(),
                dueDate == null ? null : dueDate.toString());
            issue.setDueDate(dueDate);
        }
        if (req.estimateMinutes() != null) issue.setEstimateMinutes(req.estimateMinutes());
        if (req.requesterName() != null) issue.setRequesterName(req.requesterName().trim());
        if (req.requesterPhone() != null) issue.setRequesterPhone(req.requesterPhone().trim());
        if (req.requesterEmail() != null) issue.setRequesterEmail(req.requesterEmail().trim());
        if (req.receptionChannel() != null) issue.setReceptionChannel(req.receptionChannel().trim());
        if (req.startDate() != null || req.endDate() != null) {
            LocalDate start = req.startDate() == null ? issue.getStartDate() : parseOptionalIssueDate(req.startDate());
            LocalDate end = req.endDate() == null ? issue.getEndDate() : parseOptionalIssueDate(req.endDate());
            setPlannedDates(issue, currentUser, start, end);
            issue.setGanttPinned(start != null);
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

        configuration.saveFieldValues(issue, currentUser, req.customFields(), true);
        issue = issueRepository.save(issue);

        if (oldColumn != issue.getColumnId()) {
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
        Issue issue = loadIssueForUpdate(issueId);
        permissionService.requireMoveIssue(user, issue);

        IssueColumn oldColumn = issue.getColumnId();
        BoardList oldList = issue.getBoardList();
        IssueColumn newColumn = oldColumn;
        BoardList newList = oldList;

        boolean crossBoard = req.targetBoardId() != null && !req.targetBoardId().isBlank()
            && !issue.getProject().getId().toString().equals(req.targetBoardId());
        boolean statusMove = req.expectedSourceColumn() != null;
        if (statusMove) {
            if (crossBoard || req.columnId() == null || req.columnId().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seleccione un estado del mismo proyecto");
            }
            if (oldColumn != parseIssueColumn(req.expectedSourceColumn())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "La incidencia ya cambió de estado");
            }
        }

        if (req.boardListId() != null && !req.boardListId().isBlank()) {
            UUID listProjectId = crossBoard
                ? UUID.fromString(req.targetBoardId())
                : issue.getProject().getId();
            newList = requireActiveIssueList(listProjectId, req.boardListId());
            newColumn = newList.issueColumn();
            if (statusMove && (newColumn == oldColumn || newColumn != parseIssueColumn(req.columnId()))) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La lista no corresponde al estado destino");
            }
        } else if (req.columnId() != null && !req.columnId().isBlank()) {
            newColumn = parseIssueColumn(req.columnId());
            newList = listForState(issue.getProject().getId(), newColumn);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debe indicar columna o lista destino");
        }

        if (crossBoard) {
            UUID targetProjId = UUID.fromString(req.targetBoardId());
            Project dest = projectRepository.findById(targetProjId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto destino no encontrado"));
            permissionService.requireAccessProject(user, dest);

            BoardList targetList = resolveBoardList(dest.getId(), req.boardListId(), newColumn);
            if (targetList != null) {
                newColumn = targetList.issueColumn();
            }
            return toCardLight(transferIssue(issue, dest, targetList, newColumn, req.targetIndex(), user));
        }

        configuration.requireTransition(issue.getProject().getId(), oldColumn, newColumn);
        issue.setColumnId(newColumn);
        issue.setBoardList(newList);
        if (newList != null) {
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
    public WorkBootstrapDto.CardDto assignIncomingIssue(
        ScarPrincipal principal, UUID issueId, AssignIncomingIssueRequest req
    ) {
        User actor = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        if (!permissionService.canAssignTasks(actor)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede asignar solicitudes");
        }
        Issue issue = loadIssueForUpdate(issueId);
        permissionService.requireMoveIssue(actor, issue);
        Project origin = issue.getProject();

        // A repeated submission of the same completed assignment is safe.
        if (origin.getId().equals(req.targetBoardId()) && issue.getAssignee() != null
            && issue.getAssignee().getId().equals(req.assigneeId())) {
            return toCardLight(issue);
        }
        if (origin.getType() != ProjectType.GENERAL
            && !GeneralBoardService.GENERAL_BOARD_KEY.equalsIgnoreCase(origin.getKeyCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La solicitud ya salió de la bandeja");
        }
        if (!EnumSet.of(IssueColumn.registered, IssueColumn.in_assignment, IssueColumn.todo).contains(issue.getColumnId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El estado actual no permite asignar esta solicitud");
        }
        Project dest = projectRepository.findById(req.targetBoardId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero destino no encontrado"));
        permissionService.requireAccessProject(actor, dest);
        if (dest.getType() == ProjectType.GENERAL || GeneralBoardService.GENERAL_BOARD_KEY.equalsIgnoreCase(dest.getKeyCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seleccione un tablero de trabajo");
        }
        User assignee = userRepository.findByIdWithRoles(req.assigneeId())
            .filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Responsable activo no encontrado"));
        permissionService.requireValidAssignee(actor, assignee);
        if (!projectRepository.existsMember(dest.getId(), assignee.getId())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El responsable no pertenece al tablero destino");
        }
        List<BoardList> lists = boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(dest.getId());
        BoardList list = lists.stream().filter(candidate -> candidate.issueColumn() == IssueColumn.todo)
            .findFirst().orElse(null);
        if (!lists.isEmpty() && list == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El tablero destino necesita una lista Por hacer");
        }
        User previous = issue.getAssignee();
        issue.setAssignee(assignee);
        issue.setAssignedAt(Instant.now());
        Issue updated = transferIssue(issue, dest, list, IssueColumn.todo, null, actor);
        activityLogService.log(updated, actor, "assignee", previous == null ? null : previous.getFullName(), assignee.getFullName());
        notificationService.notifyAssignment(updated, actor.getId());
        return toCardLight(updated);
    }

    private Issue transferIssue(
        Issue issue, Project dest, BoardList list, IssueColumn column, Integer targetIndex, User actor
    ) {
        var oldColumn = issue.getColumnId();
        var oldList = issue.getBoardList();
        int nextNumber = nextIssueNumber(dest.getId());
        issue.setProject(dest);
        issue.setIssueNumber(nextNumber);
        issue.setColumnId(column);
        issue.setBoardList(list);
        issue.setSortOrder(targetIndex != null ? targetIndex
            : list != null ? nextIssueListOrder(dest.getId(), list.getId()) : nextIssueOrder(dest.getId(), column));
        applyCompletionState(issue, oldColumn, column, oldList, list);
        Issue saved = issueRepository.save(issue);
        // Keep only the destination key in history so previous board membership stays private.
        activityLogService.log(saved, actor, "transfer", null, dest.getKeyCode() + "-" + nextNumber);
        if (oldColumn != column) {
            activityLogService.log(saved, actor, "column", oldColumn.name(), column.name());
            notificationService.notifyStatusChange(saved, actor.getId(), oldColumn.name(), column.name());
        }
        return saved;
    }

    private int nextIssueNumber(UUID projectId) {
        projectRepository.findByIdForUpdate(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero no encontrado"));
        return issueRepository.findTopByProjectIdOrderByIssueNumberDesc(projectId)
            .map(issue -> issue.getIssueNumber() + 1).orElse(1);
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
        Issue issue = loadIssueForUpdate(issueId);
        permissionService.requireReadIssue(author, issue);
        if (req.publicReply() && (!issue.isPublicTrackingEnabled() || !permissionService.canAssignTasks(author))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede publicar una respuesta en esta solicitud");
        }
        IssueComment comment = new IssueComment();
        comment.setIssue(issue);
        comment.setAuthor(author);
        comment.setText(req.text().trim());
        comment.setPublicReply(req.publicReply());
        comment = commentRepository.save(comment);
        if (req.publicReply()) {
            if (issue.getFirstPublicReplyAt() == null) issue.setFirstPublicReplyAt(comment.getCreatedAt());
        } else {
            processMentions(issue, req.text(), author);
        }
        return new WorkBootstrapDto.CommentDto(
            comment.getId().toString(),
            author.getId().toString(),
            comment.getText(),
            comment.getCreatedAt().toString(),
            comment.isPublicReply()
        );
    }

    @Transactional
    public WorkBootstrapDto.TimeEntryDto logTime(ScarPrincipal principal, UUID issueId, LogTimeRequest req) {
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireReadIssue(user, issue);
        TimeEntry entry = new TimeEntry();
        entry.setIssue(issue);
        entry.setUser(user);
        entry.setMinutes(req.minutes());
        entry.setNote(req.note());
        entry.setLoggedAt(parseTimeEntryLoggedAt(req.loggedAt()));
        entry.setActivityType(normalizeActivityType(req.activityType()));
        entry = timeEntryRepository.save(entry);
        issue.setTrackedMinutes(issue.getTrackedMinutes() + req.minutes());
        issueRepository.save(issue);
        return new WorkBootstrapDto.TimeEntryDto(
            entry.getId().toString(),
            user.getId().toString(),
            entry.getMinutes(),
            entry.getNote(),
            entry.getLoggedAt().toString(),
            entry.getActivityType()
        );
    }

    private String normalizeActivityType(String value) {
        if (value == null || value.isBlank()) {
            return "Trabajo";
        }
        return value.trim();
    }

    private Instant parseTimeEntryLoggedAt(String value) {
        if (value == null || value.isBlank()) {
            return Instant.now();
        }
        try {
            if (value.length() == 10) {
                return LocalDate.parse(value).atTime(LocalTime.NOON).toInstant(ZoneOffset.UTC);
            }
            return Instant.parse(value);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fecha de registro inválida");
        }
    }

    @Transactional
    public WorkBootstrapDto.ActiveTimerDto startTimer(ScarPrincipal principal, TimerStartRequest req) {
        User user = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        activeTimerRepository.findById(principal.userId()).ifPresent(activeTimerRepository::delete);
        Issue issue = loadIssue(UUID.fromString(req.issueId()));
        permissionService.requireReadIssue(user, issue);
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
        LogTimeRequest logReq = new LogTimeRequest(
            (int) minutes,
            timer.getNote() != null ? timer.getNote() : "Cronómetro",
            null,
            "Cronómetro"
        );
        UUID issueId = timer.getIssue().getId();
        activeTimerRepository.delete(timer);
        return logTime(principal, issueId, logReq);
    }

    @Transactional(readOnly = true)
    public GanttDto ganttAll(ScarPrincipal principal) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        List<Project> projects = visibleProjects(currentUser).stream()
            .filter(project -> !isGeneralProject(project))
            .sorted(Comparator.comparing(Project::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return buildHierarchicalGantt(currentUser, projects, true);
    }

    @Transactional(readOnly = true)
    public GanttDto gantt(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireAccessProject(currentUser, project);
        return buildHierarchicalGantt(currentUser, List.of(project), false);
    }

    private GanttDto buildHierarchicalGantt(User currentUser, List<Project> projects, boolean includeProjectSections) {
        if (projects.isEmpty()) {
            LocalDate today = LocalDate.now();
            return new GanttDto(today.toString(), today.plusDays(7).toString(), "7d", true, List.of(), List.of());
        }

        Set<UUID> projectIds = projects.stream().map(Project::getId).collect(Collectors.toSet());
        List<Issue> allIssues = readableIssues(currentUser, issueRepository.findByProjectIdIn(projectIds));
        Set<UUID> readableIds = allIssues.stream().map(Issue::getId).collect(Collectors.toSet());
        Map<UUID, List<Issue>> issuesByProject = allIssues.stream()
            .collect(Collectors.groupingBy(i -> i.getProject().getId()));
        Map<UUID, List<BoardList>> listsByProject = boardListRepository.findByProjectIdInAndArchivedFalseOrderBySortOrderAsc(projectIds)
            .stream().collect(Collectors.groupingBy(list -> list.getProject().getId()));
        List<GanttDto.GanttTaskDto> rows = new ArrayList<>();
        for (Project project : projects) {
            String projectSectionId = "section-project-" + project.getId();
            List<Issue> projectIssues = issuesByProject.getOrDefault(project.getId(), List.of());
            DateRange projectRange = dateRangeForIssues(projectIssues);
            Set<UUID> issueIds = projectIssues.stream().map(Issue::getId).collect(Collectors.toSet());
            Map<UUID, List<Issue>> childrenByParent = projectIssues.stream()
                .filter(i -> i.getParentIssue() != null && issueIds.contains(i.getParentIssue().getId()))
                .collect(Collectors.groupingBy(i -> i.getParentIssue().getId()));

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
            List<BoardList> lists = listsByProject.getOrDefault(project.getId(), List.of());
            Map<UUID, List<Issue>> issuesByList = projectIssues.stream()
                .filter(i -> i.getBoardList() != null)
                .collect(Collectors.groupingBy(i -> i.getBoardList().getId()));

            Set<UUID> activeLists = lists.stream().map(BoardList::getId).collect(Collectors.toSet());

            for (BoardList list : lists) {
                appendListSection(rows, project, list, issuesByList.getOrDefault(list.getId(), List.of()),
                    listParentId, childrenByParent, issueIds, currentUser);
            }

            List<Issue> unlisted = projectIssues.stream()
                .filter(i -> i.getBoardList() == null || !activeLists.contains(i.getBoardList().getId()))
                .toList();
            if (!unlisted.isEmpty()) {
                appendListSection(rows, project, null, unlisted, listParentId, childrenByParent, issueIds, currentUser);
            }
        }

        List<IssueDependency> deps = dependencyRepository.findByProjectIdIn(projectIds);
        List<GanttDto.GanttLinkDto> links = deps.stream()
            .filter(dep -> readableIds.contains(dep.getIssue().getId()) && readableIds.contains(dep.getDependsOnIssue().getId()))
            .map(d -> new GanttDto.GanttLinkDto(
                d.getId().toString(),
                d.getDependsOnIssue().getId().toString(),
                d.getIssue().getId().toString(),
                d.getDependencyType().name()
            ))
            .toList();

        LocalDate minStart = allIssues.stream().map(Issue::getStartDate).filter(Objects::nonNull).min(LocalDate::compareTo)
            .orElse(LocalDate.now());
        LocalDate maxEnd = allIssues.stream().map(this::ganttEnd).filter(Objects::nonNull).max(LocalDate::compareTo)
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
        Map<UUID, List<Issue>> childrenByParent,
        Set<UUID> projectIssueIds,
        User user
    ) {
        List<Issue> roots = listIssues.stream()
            .filter(i -> i.getParentIssue() == null || !projectIssueIds.contains(i.getParentIssue().getId()))
            .sorted(Comparator.comparingInt(Issue::getSortOrder).thenComparingInt(Issue::getIssueNumber))
            .toList();
        if (roots.isEmpty()) return;
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

        for (Issue root : roots) {
            appendIssueTree(rows, root, listSectionId, childrenByParent, user);
        }
    }

    private void appendIssueTree(
        List<GanttDto.GanttTaskDto> rows,
        Issue issue,
        String parentId,
        Map<UUID, List<Issue>> childrenByParent,
        User user
    ) {
        List<Issue> children = childrenByParent.getOrDefault(issue.getId(), List.of()).stream()
            .sorted(Comparator.comparingInt(Issue::getSortOrder).thenComparingInt(Issue::getIssueNumber))
            .toList();
        rows.add(ganttTask(issue, user, !children.isEmpty(), parentId, issue.getStartDate(), ganttEnd(issue),
            issue.getEstimateMinutes(), issue.isGanttPinned()));
        for (Issue child : children) {
            appendIssueTree(rows, child, issue.getId().toString(), childrenByParent, user);
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
            dateText(range.start()),
            dateText(range.end()),
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
            boardListId,
            null, 0, null, false, false
        );
    }

    private DateRange dateRangeForIssues(List<Issue> issues) {
        LocalDate start = issues.stream().map(Issue::getStartDate).filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
        LocalDate end = issues.stream().map(this::ganttEnd).filter(Objects::nonNull).max(LocalDate::compareTo).orElse(start);
        return new DateRange(start, end);
    }

    private record DateRange(LocalDate start, LocalDate end) {}

    @Transactional
    public GanttDto recalculateGantt(ScarPrincipal principal, UUID projectId) {
        User currentUser = requireGanttProjectRecalculation(principal, projectId);
        List<UUID> ids = issueRepository.findByProjectId(projectId).stream().map(Issue::getId).toList();
        List<Issue> issues = ids.isEmpty() ? List.of() : issueRepository.findAllForUpdate(ids);
        List<IssueDependency> deps = dependencyRepository.findByProjectId(projectId);
        LocalDate start = issues.stream().map(Issue::getStartDate).filter(Objects::nonNull)
            .min(LocalDate::compareTo).orElse(LocalDate.now());
        List<GanttScheduler.Task> tasks = issues.stream()
            .sorted(Comparator.comparingInt(Issue::getSortOrder).thenComparingInt(Issue::getIssueNumber))
            .map(issue -> ganttScheduleTask(issue, issue.getStartDate(), ganttEnd(issue), issue.getEstimateMinutes(), issue.isGanttPinned()))
            .toList();
        Map<UUID, GanttScheduler.Window> windows = scheduleGantt(tasks, deps, new GanttScheduler.Options(start, null, null, false));
        for (Issue issue : issues) {
            if (issue.isGanttPinned()) continue;
            GanttScheduler.Window window = windows.get(issue.getId());
            setPlannedDates(issue, currentUser, window.start(), window.end());
        }
        return gantt(principal, projectId);
    }

    @Transactional(readOnly = true)
    public User requireGanttProjectRecalculation(ScarPrincipal principal, UUID projectId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId()).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireAccessProject(currentUser, project);
        if (!permissionService.isAdminOrChief(currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo administración o jefatura pueden recalcular el plan");
        }
        return currentUser;
    }

    @Transactional(readOnly = true)
    public WeeklyPlanDto getWeeklyPlan(ScarPrincipal principal, UUID projectId, String weekStartParam) {
        LocalDate weekStart = parseWeekStart(weekStartParam);
        LocalDate weekEnd = weekStart.plusDays(6);
        boolean groupedByProject = projectId == null;

        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        Map<UUID, Project> projectsById = visibleProjects(currentUser).stream()
            .filter(project -> projectId == null || project.getId().equals(projectId))
            .filter(project -> !groupedByProject || !isGeneralProject(project))
            .collect(Collectors.toMap(Project::getId, project -> project, (a, b) -> a));
        Set<UUID> projectIds = projectsById.keySet();

        if (projectIds.isEmpty()) {
            return new WeeklyPlanDto(weekStart.toString(), weekEnd.toString(), groupedByProject, List.of());
        }

        List<Issue> issues = readableIssues(currentUser, issueRepository.findByProjectIdIn(projectIds)).stream()
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
                        : (issue.getDescription() != null ? issue.getDescription() : ""),
                    issue.getId().toString()
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

    public record WeeklyExport(byte[] bytes, List<UUID> issueIds) {}

    @Transactional(readOnly = true)
    public WeeklyExport prepareWeeklyExport(ScarPrincipal principal, UUID projectId, String weekStart) {
        requireWeeklyExportAccess(principal, projectId, List.of());
        WeeklyPlanDto plan = getWeeklyPlan(principal, projectId, weekStart);
        List<UUID> visible = plan.groups().stream().flatMap(group -> group.rows().stream())
            .map(row -> UUID.fromString(row.issueId())).distinct().toList();
        return new WeeklyExport(weeklyPlanExcelService.export(plan), visible);
    }

    @Transactional(readOnly = true)
    public void requireWeeklyExportAccess(ScarPrincipal principal, UUID projectId, List<UUID> issueIds) {
        User user = userRepository.findByIdWithRoles(principal.userId()).filter(User::isActive)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        Set<UUID> projects = visibleProjectIds(user);
        if (projectId != null && !projects.contains(projectId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (issueIds.isEmpty()) return;
        List<Issue> issues = issueRepository.findAllById(issueIds);
        if (issues.size() != issueIds.size() || issues.stream().anyMatch(issue ->
            !projects.contains(issue.getProject().getId()) || !permissionService.canReadProjectIssue(user, issue))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Vuelve a generar el archivo con tus permisos vigentes");
        }
    }

    public String weeklyPlanFileName(String weekStartParam) {
        return weeklyPlanExcelService.fileName(parseWeekStart(weekStartParam));
    }

    @Transactional
    public GanttDto.GanttTaskDto updateGanttTaskDates(ScarPrincipal principal, UUID issueId, GanttTaskUpdateRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssueForUpdate(issueId);
        permissionService.requireReadIssue(currentUser, issue);
        permissionService.requireUpdateIssue(currentUser, issue, null);
        LocalDate start = req.start() == null ? null : parseOptionalIssueDate(req.start());
        LocalDate end = req.end() == null ? null : parseOptionalIssueDate(req.end());
        boolean pinned = start != null && !Boolean.FALSE.equals(req.pinned());
        applyGanttSchedule(issue, currentUser, start, end,
            req.updateEstimate() ? req.estimateMinutes() : issue.getEstimateMinutes(), pinned);
        return ganttTask(issue, currentUser, false, null, start, ganttEnd(issue), issue.getEstimateMinutes(), pinned);
    }

    void applyGanttSchedule(Issue issue, User actor, LocalDate start, LocalDate end, Integer estimate, boolean pinned) {
        validateGanttDates(start, end);
        setPlannedDates(issue, actor, start, end);
        activityLogService.log(issue, actor, "estimate", Objects.toString(issue.getEstimateMinutes(), null), Objects.toString(estimate, null));
        issue.setEstimateMinutes(estimate);
        issue.setGanttPinned(start != null && pinned);
    }

    static void validateGanttDates(LocalDate start, LocalDate end) {
        if ((start == null) != (end == null)
            || (start != null && (start.getYear() < 1900 || end.getYear() > 2200 || end.isBefore(start)
                || java.time.temporal.ChronoUnit.DAYS.between(start, end) > GanttScheduler.MAX_PLAN_DAYS))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indique un intervalo válido o deje ambas fechas vacías");
        }
    }

    GanttScheduler.Task ganttScheduleTask(Issue issue, LocalDate start, LocalDate end, Integer estimate, boolean pinned) {
        return new GanttScheduler.Task(issue.getId(), issue.getAssignee() == null ? null : issue.getAssignee().getId(),
            start, end, estimate, issue.getTrackedMinutes(), issue.getColumnId() == IssueColumn.done || issue.getColumnId() == IssueColumn.closed, pinned);
    }

    Map<UUID, GanttScheduler.Window> scheduleGantt(List<GanttScheduler.Task> tasks, List<IssueDependency> dependencies,
        GanttScheduler.Options options) {
        try {
            return GanttScheduler.schedule(tasks, dependencies.stream().map(link -> new GanttScheduler.Edge(
                link.getDependsOnIssue().getId(), link.getIssue().getId(), link.getDependencyType())).toList(), options);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, error.getMessage());
        }
    }

    private void setPlannedDates(Issue issue, User actor, LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha final no puede ser anterior al inicio");
        }
        activityLogService.log(issue, actor, "planned_dates",
            describePlan(issue.getStartDate(), issue.getEndDate()), describePlan(start, end));
        issue.setStartDate(start);
        issue.setEndDate(end);
    }

    private String describePlan(LocalDate start, LocalDate end) {
        if (start == null && end == null) return null;
        return (start == null ? "Sin inicio" : start.toString()) + " → " + (end == null ? "Sin fin" : end.toString());
    }

    private LocalDate parseOptionalIssueDate(String value) {
        if (value.isBlank()) return null;
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ingrese una fecha válida");
        }
    }

    @Transactional
    public GanttDto.GanttLinkDto addDependency(ScarPrincipal principal, UUID issueId, DependencyRequest req) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Issue issue = loadIssue(issueId);
        permissionService.requireReadIssue(currentUser, issue);
        permissionService.requireUpdateIssue(currentUser, issue, null);
        Issue dependsOn = loadIssue(UUID.fromString(req.dependsOnIssueId()));
        permissionService.requireReadIssue(currentUser, dependsOn);
        if (!issue.getProject().getId().equals(dependsOn.getProject().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las dependencias deben ser del mismo proyecto");
        }
        if (issue.getId().equals(dependsOn.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Una incidencia no puede depender de sí misma");
        }
        UUID projectId = issue.getProject().getId();
        projectRepository.findByIdForUpdate(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tablero no encontrado"));
        List<IssueDependency> dependencies = dependencyRepository.findByProjectId(projectId);
        boolean exists = dependencies.stream().anyMatch(link ->
            link.getIssue().getId().equals(issueId) && link.getDependsOnIssue().getId().equals(dependsOn.getId()));
        if (exists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La dependencia ya está registrada");
        }
        if (dependencyPathExists(issueId, dependsOn.getId(), dependencies)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La dependencia crearía un ciclo");
        }
        IssueDependency dep = new IssueDependency();
        dep.setIssue(issue);
        dep.setDependsOnIssue(dependsOn);
        try {
            dep.setDependencyType(req.dependencyType() == null ? DependencyType.FINISH_TO_START
                : DependencyType.valueOf(req.dependencyType().trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tipo de dependencia no válido");
        }
        dep = dependencyRepository.save(dep);
        return new GanttDto.GanttLinkDto(
            dep.getId().toString(),
            dependsOn.getId().toString(),
            issue.getId().toString(),
            dep.getDependencyType().name()
        );
    }

    private boolean dependencyPathExists(UUID from, UUID to, List<IssueDependency> dependencies) {
        Map<UUID, List<UUID>> successors = new HashMap<>();
        for (IssueDependency link : dependencies) {
            successors.computeIfAbsent(link.getDependsOnIssue().getId(), key -> new ArrayList<>())
                .add(link.getIssue().getId());
        }
        Set<UUID> seen = new HashSet<>();
        Deque<UUID> pending = new ArrayDeque<>();
        pending.add(from);
        while (!pending.isEmpty()) {
            UUID step = pending.removeFirst();
            if (step.equals(to)) return true;
            if (seen.add(step)) pending.addAll(successors.getOrDefault(step, List.of()));
        }
        return false;
    }

    @Transactional
    public void removeDependency(ScarPrincipal principal, UUID dependencyId) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        IssueDependency dep = dependencyRepository.findById(dependencyId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissionService.requireReadIssue(currentUser, dep.getIssue());
        permissionService.requireReadIssue(currentUser, dep.getDependsOnIssue());
        permissionService.requireUpdateIssue(currentUser, dep.getIssue(), null);
        dependencyRepository.delete(dep);
    }

    @Transactional(readOnly = true)
    public ReportsDto getReports(ScarPrincipal principal, UUID projectId, String startDate, String endDate) {
        User currentUser = userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        Set<UUID> accessibleProjectIds = visibleProjectIds(currentUser);

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
        issues = readableIssues(currentUser, issues).stream()
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
                .filter(entry -> permissionService.canReadProjectIssue(currentUser, entry.getIssue()))
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
    public HelpdeskDto.Tracking getPublicTracking(String token) {
        UUID publicToken;
        try {
            publicToken = UUID.fromString(token);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket no encontrado");
        }
        Issue issue = issueRepository.findByPublicTokenAndPublicTrackingEnabledTrue(publicToken)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ticket no encontrado"));
        List<HelpdeskDto.PublicReply> replies = commentRepository.findByIssueIdAndPublicReplyTrueOrderByCreatedAtAsc(issue.getId())
            .stream().map(comment -> new HelpdeskDto.PublicReply(comment.getText(), comment.getCreatedAt())).toList();
        String status = switch (issue.getColumnId()) {
            case registered, backlog -> "registered";
            case in_assignment, todo, in_progress, review -> "in_progress";
            case done, closed -> "closed";
        };
        return new HelpdeskDto.Tracking(publicReference(issue), status, issue.getCreatedAt(), replies);
    }

    private String publicReference(Issue issue) {
        return "SOL-" + issue.getId().toString().substring(0, 12).replace("-", "").toUpperCase(Locale.ROOT);
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
                .filter(user -> user.isActive() && permissionService.canReadIssue(user, issue))
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

    private BoardList listForState(UUID projectId, IssueColumn status) {
        return boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(projectId)
            .stream().filter(list -> list.issueColumn() == status).findFirst().orElse(null);
    }

    private boolean isDoneList(BoardList list) {
        return list != null && list.issueColumn() == IssueColumn.done;
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

    private BoardList requireActiveIssueList(UUID projectId, String id) {
        UUID listId;
        try {
            listId = UUID.fromString(id);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lista no válida");
        }
        BoardList list = boardListRepository.findByIdAndProjectId(listId, projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));
        if (list.isArchived()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La lista destino está archivada");
        }
        return list;
    }

    private IssueColumn parseIssueColumn(String column) {
        try {
            return IssueColumn.valueOf(column == null ? "" : column);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado de incidencia no válido");
        }
    }

    private Issue loadIssueForUpdate(UUID id) {
        return issueRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incidencia no encontrada"));
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

    private List<Issue> readableIssues(User user, List<Issue> issues) {
        return issues.stream().filter(issue -> permissionService.canReadProjectIssue(user, issue)).toList();
    }

    private List<Project> visibleProjects(User user) {
        return projectRepository.findVisibleWithMembers(user.getId(), permissionService.isAdminOrChief(user));
    }

    private Set<UUID> visibleProjectIds(User user) {
        return new HashSet<>(projectRepository.findVisibleIds(user.getId(), permissionService.isAdminOrChief(user)));
    }

    private List<WorkBootstrapDto.CommentDto> mapComments(List<IssueComment> comments) {
        return comments.stream().map(c -> new WorkBootstrapDto.CommentDto(
            c.getId().toString(),
            c.getAuthor().getId().toString(),
            c.getText(),
            c.getCreatedAt().toString(),
            c.isPublicReply()
        )).toList();
    }

    private List<WorkBootstrapDto.TimeEntryDto> mapTimeEntries(List<TimeEntry> entries) {
        return entries.stream().map(t -> new WorkBootstrapDto.TimeEntryDto(
            t.getId().toString(),
            t.getUser().getId().toString(),
            t.getMinutes(),
            t.getNote(),
            t.getLoggedAt().toString(),
            t.getActivityType()
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

    GanttDto.GanttTaskDto ganttTask(Issue issue, User user, boolean hasChildren, String parentId,
        LocalDate start, LocalDate end, Integer estimate, boolean pinned) {
        Project project = issue.getProject();
        int progress = issue.getColumnId() == IssueColumn.done || issue.getColumnId() == IssueColumn.closed ? 100
            : estimate == null || estimate <= 0 ? 0 : (int) Math.min(100, issue.getTrackedMinutes() * 100L / estimate);
        String boardListId = issue.getBoardList() != null ? issue.getBoardList().getId().toString() : null;
        return new GanttDto.GanttTaskDto(
            issue.getId().toString(),
            project.getKeyCode() + "-" + issue.getIssueNumber(),
            issue.getTitle(),
            dateText(start),
            dateText(end),
            issue.getColumnId().name(),
            issue.getAssignee() != null ? issue.getAssignee().getFullName() : null,
            progress,
            parentId,
            estimate,
            issue.getPriority().name(),
            issue.getIssueType() != null ? issue.getIssueType() : "",
            project.getName(),
            issue.getObservations(),
            hasChildren,
            "TASK",
            project.getId().toString(),
            boardListId,
            issue.getAssignee() == null ? null : issue.getAssignee().getId().toString(),
            issue.getTrackedMinutes(),
            dateText(issue.getDueDate()),
            pinned,
            permissionService.canMoveAccessibleIssue(user, issue)
        );
    }

    LocalDate ganttEnd(Issue issue) {
        LocalDate start = issue.getStartDate();
        if (start == null) return null;
        LocalDate end = issue.getEndDate();
        return end != null && !end.isBefore(start) ? end : GanttScheduler.endDate(start, GanttScheduler.estimatedDays(issue.getEstimateMinutes()), false);
    }

    private String dateText(LocalDate date) {
        return date == null ? null : date.toString();
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
            null,
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            List.of(),
            i.isHelpdeskRequest(),
            i.isPublicTrackingEnabled(),
            helpdeskSla.forIssue(i)
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
            null,
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            List.of(),
            i.isHelpdeskRequest(),
            i.isPublicTrackingEnabled(),
            helpdeskSla.forIssue(i)
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
            null,
            i.getStartDate() != null ? i.getStartDate().toString() : null,
            i.getEndDate() != null ? i.getEndDate().toString() : null,
            issueTypeValue(i),
            i.getObservations(),
            mapAttachments(attachmentRepository.findByIssueIdOrderByCreatedAtDesc(issueId)),
            i.isHelpdeskRequest(),
            i.isPublicTrackingEnabled(),
            helpdeskSla.forIssue(i)
        );
    }
}

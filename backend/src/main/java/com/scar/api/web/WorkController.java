package com.scar.api.web;

import com.scar.api.dto.*;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.WorkService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class WorkController {

    private final WorkService workService;

    public WorkController(WorkService workService) {
        this.workService = workService;
    }

    @GetMapping("/work/general-board")
    public WorkBootstrapDto.BoardDto generalBoard(@AuthenticationPrincipal ScarPrincipal principal) {
        return workService.getGeneralBoard(principal);
    }

    @GetMapping("/work/bootstrap")
    public WorkBootstrapDto bootstrap(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(defaultValue = "all") String cards,
        @RequestParam(required = false) UUID boardId
    ) {
        return workService.bootstrap(principal, cards, boardId);
    }

    @GetMapping("/projects/{projectId}/cards")
    public List<WorkBootstrapDto.CardDto> projectCards(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID projectId
    ) {
        return workService.getProjectCards(principal, projectId);
    }

    @GetMapping("/dashboards")
    public DashboardDto dashboards(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(required = false) String startDate,
        @RequestParam(required = false) String endDate
    ) {
        return workService.getDashboard(principal, projectId, startDate, endDate);
    }

    @GetMapping("/issues/{id}/details")
    public IssueDetailsDto getIssueDetails(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        return workService.getIssueDetails(principal, id);
    }

    @PostMapping("/issues")
    public WorkBootstrapDto.CardDto createIssue(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody CreateIssueRequest request
    ) {
        return workService.createIssue(principal, request);
    }

    @PutMapping("/issues/{id}")
    public WorkBootstrapDto.CardDto updateIssue(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody UpdateIssueRequest request
    ) {
        return workService.updateIssue(principal, id, request);
    }

    @PatchMapping("/issues/{id}/move")
    public WorkBootstrapDto.CardDto moveIssue(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @RequestBody MoveIssueRequest request
    ) {
        return workService.moveIssue(principal, id, request);
    }

    @DeleteMapping("/issues/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteIssue(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        workService.deleteIssue(principal, id);
    }

    @PostMapping("/issues/{id}/comments")
    public WorkBootstrapDto.CommentDto addComment(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody CommentRequest request
    ) {
        return workService.addComment(principal, id, request);
    }

    @PostMapping("/issues/{id}/time")
    public WorkBootstrapDto.TimeEntryDto logTime(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody LogTimeRequest request
    ) {
        return workService.logTime(principal, id, request);
    }

    @PostMapping("/time/timer/start")
    public WorkBootstrapDto.ActiveTimerDto startTimer(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody TimerStartRequest request
    ) {
        return workService.startTimer(principal, request);
    }

    @PostMapping("/time/timer/stop")
    public WorkBootstrapDto.TimeEntryDto stopTimer(@AuthenticationPrincipal ScarPrincipal principal) {
        return workService.stopTimer(principal);
    }

    @GetMapping("/time/entries")
    public List<TimeEntryWithIssueDto> listTimeEntries(@AuthenticationPrincipal ScarPrincipal principal) {
        return workService.listTimeEntries(principal);
    }

    @GetMapping("/gantt")
    public GanttDto gantt(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId
    ) {
        if (projectId == null) {
            return workService.ganttAll(principal);
        }
        return workService.gantt(principal, projectId);
    }

    @PatchMapping("/gantt/tasks/{id}")
    public GanttDto.GanttTaskDto updateGanttTaskDates(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody GanttTaskUpdateRequest request
    ) {
        return workService.updateGanttTaskDates(principal, id, request);
    }

    @PostMapping("/issues/{id}/dependencies")
    public GanttDto.GanttLinkDto addDependency(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody DependencyRequest request
    ) {
        return workService.addDependency(principal, id, request);
    }

    @DeleteMapping("/dependencies/{id}")
    public void removeDependency(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        workService.removeDependency(principal, id);
    }

    @GetMapping("/reports")
    public ReportsDto reports(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(required = false) String startDate,
        @RequestParam(required = false) String endDate
    ) {
        return workService.getReports(principal, projectId, startDate, endDate);
    }

    @GetMapping("/reports/weekly-plan")
    public WeeklyPlanDto weeklyPlan(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(required = false) String weekStart
    ) {
        return workService.getWeeklyPlan(principal, projectId, weekStart);
    }

    @GetMapping("/reports/weekly-plan/export")
    public org.springframework.http.ResponseEntity<byte[]> exportWeeklyPlan(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(required = false) String weekStart
    ) {
        byte[] content = workService.exportWeeklyPlanExcel(principal, projectId, weekStart);
        String fileName = workService.weeklyPlanFileName(weekStart);
        return org.springframework.http.ResponseEntity.ok()
            .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
            .header(org.springframework.http.HttpHeaders.CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .body(content);
    }

    @PostMapping("/gantt/recalculate")
    public GanttDto recalculateGantt(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam UUID projectId
    ) {
        return workService.recalculateGantt(principal, projectId);
    }

    @GetMapping("/public/tracking/{token}")
    public WorkBootstrapDto.CardDto getPublicTracking(@PathVariable String token) {
        return workService.getPublicTracking(token);
    }

    @PostMapping("/projects")
    public WorkBootstrapDto.BoardDto createProject(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody CreateProjectRequest request
    ) {
        return workService.createProject(principal, request);
    }

    @PatchMapping("/projects/{id}/members")
    public WorkBootstrapDto.BoardDto updateProjectMembers(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody UpdateProjectMembersRequest request
    ) {
        return workService.updateProjectMembers(principal, id, request);
    }

    @DeleteMapping("/projects/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteProject(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        workService.deleteProject(principal, id);
    }
}

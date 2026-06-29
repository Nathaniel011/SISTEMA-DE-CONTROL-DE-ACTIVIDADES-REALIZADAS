package com.scar.api.web;

import com.scar.api.dto.*;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.WorkService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api")
public class WorkController {

    private final WorkService workService;

    public WorkController(WorkService workService) {
        this.workService = workService;
    }

    @GetMapping("/work/bootstrap")
    public WorkBootstrapDto bootstrap(@AuthenticationPrincipal ScarPrincipal principal) {
        return workService.bootstrap(principal);
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
        @RequestBody UpdateIssueRequest request
    ) {
        return workService.updateIssue(principal, id, request);
    }

    @PatchMapping("/issues/{id}/move")
    public WorkBootstrapDto.CardDto moveIssue(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody MoveIssueRequest request
    ) {
        return workService.moveIssue(principal, id, request);
    }

    @DeleteMapping("/issues/{id}")
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

    @GetMapping("/gantt")
    public GanttDto gantt(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam UUID projectId
    ) {
        return workService.gantt(principal, projectId);
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
}

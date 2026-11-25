package com.scar.api.web;

import com.scar.api.dto.GanttDto;
import com.scar.api.dto.GanttPlanDto;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.GanttPlanService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/gantt/plans")
public class GanttPlanController {
    private final GanttPlanService plans;

    public GanttPlanController(GanttPlanService plans) { this.plans = plans; }

    @GetMapping
    public List<GanttPlanDto> list(@AuthenticationPrincipal ScarPrincipal principal) {
        return plans.list(principal);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GanttPlanDto create(@AuthenticationPrincipal ScarPrincipal principal, @Valid @RequestBody GanttPlanDto.Draft draft) {
        return plans.save(principal, null, draft);
    }

    @PutMapping("/{id}")
    public GanttPlanDto update(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id,
        @Valid @RequestBody GanttPlanDto.Draft draft) {
        return plans.save(principal, id, draft);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        plans.delete(principal, id);
    }

    @GetMapping("/{id}/chart")
    public GanttDto chart(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        return plans.chart(principal, id);
    }

    @GetMapping("/{id}/candidates")
    public List<GanttPlanDto.Candidate> candidates(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id,
        @RequestParam(defaultValue = "") @Size(max = 200) String q) {
        return plans.candidates(principal, id, q);
    }

    @PutMapping("/{id}/items")
    public GanttDto select(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id,
        @Valid @RequestBody GanttPlanDto.Selection selection) {
        return plans.select(principal, id, selection.issueIds());
    }

    @PatchMapping("/{id}/items/{issueId}")
    public GanttDto updateTask(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id, @PathVariable UUID issueId,
        @Valid @RequestBody GanttPlanDto.TaskChange change) {
        return plans.updateTask(principal, id, issueId, change);
    }

    @PostMapping("/{id}/items/{issueId}")
    public GanttDto add(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id, @PathVariable UUID issueId) {
        return plans.add(principal, id, issueId);
    }

    @PostMapping("/{id}/recalculate")
    public GanttDto recalculate(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        return plans.recalculate(principal, id);
    }
}

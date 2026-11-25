package com.scar.api.web;

import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.jobs.WorkJobQueue;
import com.scar.api.service.jobs.WorkJobQueue.Kind;
import com.scar.api.service.jobs.WorkJobQueue.Status;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/gantt/jobs")
public class GanttJobController {
    private final WorkJobQueue jobs;

    public GanttJobController(WorkJobQueue jobs) { this.jobs = jobs; }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Status enqueue(@AuthenticationPrincipal ScarPrincipal principal, @RequestParam Kind kind, @RequestParam UUID target) {
        return jobs.enqueue(principal, kind, target);
    }

    @GetMapping("/{id}")
    public Status status(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        return jobs.status(principal, id);
    }
}

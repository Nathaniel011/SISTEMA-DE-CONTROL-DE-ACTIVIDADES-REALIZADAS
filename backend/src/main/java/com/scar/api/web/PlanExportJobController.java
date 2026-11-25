package com.scar.api.web;

import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.jobs.WorkJobQueue;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/planning/export-jobs")
public class PlanExportJobController {
    private final WorkJobQueue jobs;

    public PlanExportJobController(WorkJobQueue jobs) { this.jobs = jobs; }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public WorkJobQueue.Status enqueue(@AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId, @RequestParam LocalDate weekStart) {
        return jobs.enqueueExport(principal, projectId, weekStart);
    }

    @GetMapping("/{id}")
    public WorkJobQueue.Status status(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        return jobs.status(principal, id);
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<byte[]> download(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        var file = jobs.file(principal, id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName()).build().toString())
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(file.bytes());
    }
}

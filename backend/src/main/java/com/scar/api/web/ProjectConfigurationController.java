package com.scar.api.web;

import com.scar.api.dto.ProjectConfigurationDto;
import com.scar.api.dto.ProjectConfigurationDto.Field;
import com.scar.api.dto.ProjectConfigurationDto.FieldDraft;
import com.scar.api.dto.ProjectConfigurationDto.WorkflowDraft;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.ProjectConfigurationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/configuration")
public class ProjectConfigurationController {
    private final ProjectConfigurationService configuration;

    public ProjectConfigurationController(ProjectConfigurationService configuration) {
        this.configuration = configuration;
    }

    @GetMapping
    public ProjectConfigurationDto get(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID projectId) {
        return configuration.configuration(principal, projectId);
    }

    @PostMapping("/fields")
    @ResponseStatus(HttpStatus.CREATED)
    public Field addField(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID projectId,
        @Valid @RequestBody FieldDraft draft) {
        return configuration.addField(principal, projectId, draft);
    }

    @PatchMapping("/fields/{fieldId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archiveField(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID projectId,
        @PathVariable UUID fieldId, @Valid @RequestBody FieldArchive archive) {
        configuration.archiveField(principal, projectId, fieldId, archive.archived());
    }

    @PutMapping("/workflow")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void saveWorkflow(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID projectId,
        @Valid @RequestBody WorkflowDraft draft) {
        configuration.saveWorkflow(principal, projectId, draft.transitions());
    }

    public record FieldArchive(@NotNull Boolean archived) {}
}

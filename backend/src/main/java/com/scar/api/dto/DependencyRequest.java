package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record DependencyRequest(
    @NotBlank String dependsOnIssueId,
    String dependencyType
) {}

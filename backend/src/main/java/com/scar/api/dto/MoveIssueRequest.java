package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record MoveIssueRequest(
    @NotBlank String columnId,
    Integer targetIndex
) {}

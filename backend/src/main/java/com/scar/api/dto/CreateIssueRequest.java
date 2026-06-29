package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateIssueRequest(
    @NotBlank String boardId,
    @NotBlank String title,
    String type,
    String columnId
) {}

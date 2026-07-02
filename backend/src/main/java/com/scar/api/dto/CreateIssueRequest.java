package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateIssueRequest(
    @NotBlank String boardId,
    @NotBlank String title,
    String columnId,
    String boardListId,
    String parentIssueId,
    String assigneeId,
    String requesterName,
    String requesterPhone,
    String requesterEmail,
    String receptionChannel
) {}

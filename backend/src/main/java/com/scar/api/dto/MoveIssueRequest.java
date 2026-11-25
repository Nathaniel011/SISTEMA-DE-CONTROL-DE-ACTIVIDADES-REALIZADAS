package com.scar.api.dto;

import jakarta.validation.constraints.PositiveOrZero;

public record MoveIssueRequest(
    String columnId,
    String boardListId,
    @PositiveOrZero Integer targetIndex,
    String targetBoardId,
    String expectedSourceColumn
) {}

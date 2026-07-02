package com.scar.api.dto;

public record MoveIssueRequest(
    String columnId,
    String boardListId,
    Integer targetIndex,
    String targetBoardId
) {}

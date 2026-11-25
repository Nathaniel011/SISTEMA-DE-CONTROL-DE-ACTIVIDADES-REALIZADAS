package com.scar.api.dto;

import com.scar.api.domain.entity.BoardList;
import com.scar.api.domain.enums.IssueColumn;
import java.time.Instant;
import java.util.UUID;

public record BoardListDto(
    UUID id,
    UUID projectId,
    String name,
    int sortOrder,
    boolean archived,
    Instant createdAt,
    Instant updatedAt,
    IssueColumn columnId
) {
    public static BoardListDto from(BoardList list) {
        return new BoardListDto(list.getId(), list.getProject().getId(), list.getName(), list.getSortOrder(),
            list.isArchived(), list.getCreatedAt(), list.getUpdatedAt(), list.issueColumn());
    }
}

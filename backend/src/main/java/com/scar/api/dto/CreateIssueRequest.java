package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Email;
import java.util.Map;
import java.util.UUID;

public record CreateIssueRequest(
    @NotBlank String boardId,
    @NotBlank @Size(max = 500) String title,
    String columnId,
    String boardListId,
    String parentIssueId,
    String assigneeId,
    @Size(max = 160) String requesterName,
    @Size(max = 50) String requesterPhone,
    @Email @Size(max = 254) String requesterEmail,
    @Size(max = 50) String receptionChannel,
    @Size(max = 10000) String description,
    @Size(max = 50) Map<UUID, @Size(max = 500) String> customFields
) {
    public CreateIssueRequest(String boardId, String title, String columnId, String boardListId, String parentIssueId,
        String assigneeId, String requesterName, String requesterPhone, String requesterEmail, String receptionChannel,
        String description) {
        this(boardId, title, columnId, boardListId, parentIssueId, assigneeId, requesterName, requesterPhone, requesterEmail,
            receptionChannel, description, null);
    }
}

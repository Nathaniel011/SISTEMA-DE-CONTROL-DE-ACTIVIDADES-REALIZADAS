package com.scar.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;

public record UpdateIssueRequest(
    @Size(max = 500) String title,
    @Size(max = 10000) String description,
    String columnId,
    String boardListId,
    String priority,
    String assigneeId,
    String dueDate,
    @PositiveOrZero Integer estimateMinutes,
    @Size(max = 160) String requesterName,
    @Size(max = 50) String requesterPhone,
    @Email @Size(max = 254) String requesterEmail,
    @Size(max = 50) String receptionChannel,
    String startDate,
    String endDate,
    @Size(max = 100) String issueType,
    @Size(max = 10000) String observations,
    @Size(max = 50) Map<UUID, @Size(max = 500) String> customFields
) {}

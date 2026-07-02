package com.scar.api.dto;

public record UpdateIssueRequest(
    String title,
    String description,
    String columnId,
    String boardListId,
    String priority,
    String assigneeId,
    String dueDate,
    Integer estimateMinutes,
    String requesterName,
    String requesterPhone,
    String requesterEmail,
    String receptionChannel,
    String startDate,
    String endDate
) {}

package com.scar.api.dto;

public record UpdateIssueRequest(
    String title,
    String description,
    String type,
    String columnId,
    String priority,
    String assigneeId,
    String dueDate,
    Integer estimateMinutes,
    java.util.List<String> labelIds,
    String requesterName,
    String requesterPhone,
    String requesterEmail,
    String receptionChannel,
    String startDate,
    String endDate
) {}

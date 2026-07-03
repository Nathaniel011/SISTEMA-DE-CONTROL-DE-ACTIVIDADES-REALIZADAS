package com.scar.api.dto;

public record TimeEntryWithIssueDto(
    String id,
    String issueId,
    String memberId,
    String projectId,
    String projectName,
    String projectKey,
    int issueNumber,
    String issueTitle,
    String issueType,
    int minutes,
    String activityType,
    String note,
    String loggedAt
) {}

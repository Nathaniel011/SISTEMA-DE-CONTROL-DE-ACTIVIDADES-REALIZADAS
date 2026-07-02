package com.scar.api.dto;

public record TimeEntryWithIssueDto(
    String id,
    String issueId,
    String memberId,
    int minutes,
    String note,
    String loggedAt
) {}

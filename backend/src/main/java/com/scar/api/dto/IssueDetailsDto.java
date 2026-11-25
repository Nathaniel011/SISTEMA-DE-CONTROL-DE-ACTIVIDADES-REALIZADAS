package com.scar.api.dto;

import java.util.List;

public record IssueDetailsDto(
    List<WorkBootstrapDto.CommentDto> comments,
    List<WorkBootstrapDto.TimeEntryDto> timeEntries,
    List<WorkBootstrapDto.AttachmentDto> attachments,
    List<ActivityDto> activity,
    List<ProjectConfigurationDto.FieldValue> customFields,
    boolean canEdit
) {
    public record ActivityDto(String id, String actor, String action, String before, String after, String createdAt) {}
}

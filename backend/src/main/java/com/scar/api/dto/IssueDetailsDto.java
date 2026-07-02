package com.scar.api.dto;

import java.util.List;

public record IssueDetailsDto(
    List<WorkBootstrapDto.CommentDto> comments,
    List<WorkBootstrapDto.TimeEntryDto> timeEntries,
    List<WorkBootstrapDto.AttachmentDto> attachments
) {}

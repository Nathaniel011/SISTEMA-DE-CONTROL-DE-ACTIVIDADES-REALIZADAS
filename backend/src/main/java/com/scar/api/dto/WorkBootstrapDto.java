package com.scar.api.dto;

import java.util.List;
import java.util.Map;

public record WorkBootstrapDto(
    List<BoardDto> boards,
    List<BoardListDto> boardLists,
    List<CardDto> cards,
    List<MemberDto> members,
    ActiveTimerDto activeTimer,
    List<String> movableIssueIds,
    Map<String, String> boardListColumns,
    Map<String, List<ProjectConfigurationDto.Transition>> projectTransitions
) {
    public record ProjectCardsDto(List<CardDto> cards, List<String> movableIssueIds) {}
    public record BoardDto(
        String id,
        String name,
        String description,
        String key,
        String accent,
        List<String> memberIds,
        String type,
        String parentBoardId,
        String createdAt
    ) {}
    public record MemberDto(String id, String name, String initials, String role, List<String> roles) {}
    public record CommentDto(String id, String authorId, String text, String createdAt, boolean publicReply) {}
    public record TimeEntryDto(String id, String memberId, int minutes, String note, String loggedAt, String activityType) {}
    public record CardDto(
        String id,
        String boardId,
        String boardListId,
        String parentIssueId,
        int issueNumber,
        String columnId,
        String title,
        String description,
        String priority,
        String assigneeId,
        String dueDate,
        Integer estimateMinutes,
        int trackedMinutes,
        List<CommentDto> comments,
        List<TimeEntryDto> timeEntries,
        int order,
        String createdAt,
        String updatedAt,
        String assignedAt,
        String completedAt,
        String requesterName,
        String requesterPhone,
        String requesterEmail,
        String receptionChannel,
        String publicToken,
        String startDate,
        String endDate,
        String issueType,
        String observations,
        List<AttachmentDto> attachments,
        boolean helpdeskRequest,
        boolean publicTrackingEnabled,
        HelpdeskDto.Sla sla
    ) {}

    public record AttachmentDto(
        String id,
        String fileName,
        String fileUrl,
        String mimeType,
        Long fileSize,
        String createdAt
    ) {}
    public record ActiveTimerDto(String cardId, String startedAt, String note) {}
}

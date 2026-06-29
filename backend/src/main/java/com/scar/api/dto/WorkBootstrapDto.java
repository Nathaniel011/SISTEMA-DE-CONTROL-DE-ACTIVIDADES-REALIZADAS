package com.scar.api.dto;

import java.util.List;

public record WorkBootstrapDto(
    List<BoardDto> boards,
    List<CardDto> cards,
    List<LabelDto> labels,
    List<MemberDto> members,
    ActiveTimerDto activeTimer
) {
    public record BoardDto(String id, String name, String description, String key, String accent, List<String> memberIds, String createdAt) {}
    public record MemberDto(String id, String name, String initials, String role) {}
    public record LabelDto(String id, String name, String color) {}
    public record CommentDto(String id, String authorId, String text, String createdAt) {}
    public record TimeEntryDto(String id, String memberId, int minutes, String note, String loggedAt) {}
    public record CardDto(
        String id,
        String boardId,
        int issueNumber,
        String type,
        String columnId,
        String title,
        String description,
        String priority,
        String assigneeId,
        List<String> labelIds,
        String dueDate,
        Integer estimateMinutes,
        int trackedMinutes,
        List<CommentDto> comments,
        List<TimeEntryDto> timeEntries,
        int order,
        String createdAt,
        String updatedAt
    ) {}
    public record ActiveTimerDto(String cardId, String startedAt, String note) {}
}

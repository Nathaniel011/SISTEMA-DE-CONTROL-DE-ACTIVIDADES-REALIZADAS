package com.scar.api.dto;

import java.util.List;

public record GanttDto(
    String projectStart,
    String projectEnd,
    String durationLabel,
    boolean hierarchical,
    List<GanttTaskDto> tasks,
    List<GanttLinkDto> links
) {
    public record GanttTaskDto(
        String id,
        String key,
        String title,
        String start,
        String end,
        String columnId,
        String assigneeName,
        int progress,
        String parentId,
        Integer estimateMinutes,
        String priority,
        String issueType,
        String projectName,
        String observations,
        boolean hasChildren,
        String rowType,
        String projectId,
        String boardListId,
        String assigneeId,
        int trackedMinutes,
        String dueDate,
        boolean pinned,
        boolean canEdit
    ) {}
    public record GanttLinkDto(String id, String source, String target, String type) {}
}

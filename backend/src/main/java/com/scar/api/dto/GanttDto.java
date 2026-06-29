package com.scar.api.dto;

import java.util.List;

public record GanttDto(
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
        int progress
    ) {}
    public record GanttLinkDto(String id, String source, String target, String type) {}
}

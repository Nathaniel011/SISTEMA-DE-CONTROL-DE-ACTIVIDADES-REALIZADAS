package com.scar.api.dto;

import java.util.List;

public record WeeklyPlanDto(
    String weekStart,
    String weekEnd,
    boolean groupedByProject,
    List<WeeklyPlanGroupDto> groups
) {
    public record WeeklyPlanGroupDto(
        String projectName,
        List<WeeklyPlanRowDto> rows
    ) {}

    public record WeeklyPlanRowDto(
        int index,
        String issueKey,
        String projectName,
        String title,
        String members,
        String startDay,
        String endDay,
        String priority,
        String issueType,
        String observations
    ) {}
}

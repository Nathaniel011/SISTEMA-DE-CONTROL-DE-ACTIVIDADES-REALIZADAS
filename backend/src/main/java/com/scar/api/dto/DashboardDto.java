package com.scar.api.dto;

import java.util.List;

public record DashboardDto(
    int total,
    int open,
    int inProgress,
    int done,
    int unassigned,
    int critical,
    int trackedMinutes,
    List<ChartItemDto> byStatus,
    List<ChartItemDto> byPriority
) {
    public record ChartItemDto(String label, int count) {}
}

package com.scar.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record GanttTaskUpdateRequest(
    String start,
    String end,
    @Min(0) @Max(1_752_000) Integer estimateMinutes,
    boolean updateEstimate,
    Boolean pinned
) {}

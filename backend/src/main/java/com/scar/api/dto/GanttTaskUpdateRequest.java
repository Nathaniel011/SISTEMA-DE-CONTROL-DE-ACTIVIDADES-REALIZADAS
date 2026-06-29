package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record GanttTaskUpdateRequest(
    @NotBlank String start,
    @NotBlank String end
) {}

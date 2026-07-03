package com.scar.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record LogTimeRequest(
    @NotNull @Min(1) Integer minutes,
    String note,
    String loggedAt,
    String activityType
) {}

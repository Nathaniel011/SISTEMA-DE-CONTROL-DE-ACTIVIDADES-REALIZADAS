package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record TimerStartRequest(
    @NotBlank String issueId,
    String note
) {}

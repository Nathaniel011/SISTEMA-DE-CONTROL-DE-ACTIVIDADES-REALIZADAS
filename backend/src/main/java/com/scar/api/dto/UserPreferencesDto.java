package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UserPreferencesDto(
    @NotBlank
    @Pattern(regexp = "all|assigned|commented|mentioned|unassigned")
    String activeIssueFilter
) {}

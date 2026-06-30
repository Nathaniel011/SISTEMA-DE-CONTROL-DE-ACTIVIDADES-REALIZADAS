package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateProjectRequest(
    @NotBlank String name,
    String description
) {}

package com.scar.api.dto;

import java.time.Instant;
import java.util.UUID;

public record BoardListDto(
    UUID id,
    UUID projectId,
    String name,
    int sortOrder,
    boolean archived,
    Instant createdAt,
    Instant updatedAt
) {}

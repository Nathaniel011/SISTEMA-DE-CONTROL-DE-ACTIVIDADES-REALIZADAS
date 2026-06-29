package com.scar.api.dto;

public record WhiteboardDto(
    String id,
    String projectId,
    String projectName,
    String name,
    String description,
    String contentJson,
    String updatedByName,
    String createdAt,
    String updatedAt
) {}

package com.scar.api.dto;

public record WhiteboardRequest(
    String projectId,
    String name,
    String description,
    String contentJson
) {}

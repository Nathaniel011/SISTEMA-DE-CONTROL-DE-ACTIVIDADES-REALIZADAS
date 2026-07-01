package com.scar.api.dto;

public record UpdateBoardListRequest(
    String name,
    int sortOrder,
    boolean archived
) {}

package com.scar.api.dto;

public record CreateBoardListRequest(
    String name,
    int sortOrder
) {}

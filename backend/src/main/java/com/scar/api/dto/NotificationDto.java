package com.scar.api.dto;

public record NotificationDto(
    String id,
    String type,
    String title,
    String message,
    String issueId,
    boolean read,
    String createdAt
) {}

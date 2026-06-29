package com.scar.api.dto;

import java.util.List;

public record KnowledgeArticleDto(
    String id,
    String projectId,
    String projectName,
    String title,
    String slug,
    String content,
    List<String> tags,
    String status,
    String authorName,
    String updatedByName,
    String createdAt,
    String updatedAt
) {}

package com.scar.api.dto;

import java.util.List;

public record KnowledgeArticleRequest(
    String projectId,
    String title,
    String content,
    List<String> tags,
    String status
) {}

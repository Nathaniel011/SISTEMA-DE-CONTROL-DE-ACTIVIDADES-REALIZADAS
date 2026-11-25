package com.scar.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record KnowledgeArticleRequest(
    UUID projectId,
    @Size(max = 255) String title,
    @Size(max = 100_000) String content,
    @Size(max = 30) List<@NotBlank @Size(max = 64) @Pattern(regexp = "[^,]*") String> tags,
    @Size(max = 16) String status,
    boolean clearProject,
    Instant expectedUpdatedAt
) {}

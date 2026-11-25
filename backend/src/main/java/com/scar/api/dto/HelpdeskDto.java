package com.scar.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class HelpdeskDto {
    private HelpdeskDto() {}

    public record Submission(
        @NotNull UUID requestId,
        @NotBlank @Size(max = 160) String name,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(max = 500) String title,
        @NotBlank @Size(max = 10000) String description
    ) {}

    public record Receipt(String reference, UUID trackingToken) {}
    public record PublicReply(String text, Instant createdAt) {}
    public record Tracking(String reference, String status, Instant createdAt, List<PublicReply> replies) {}
    public record Sla(Instant firstReplyDueAt, Instant firstReplyAt, Instant resolutionDueAt, Instant resolvedAt) {}
}

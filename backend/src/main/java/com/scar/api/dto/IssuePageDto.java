package com.scar.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record IssuePageDto(List<Row> items, Counts counts, long total, int page) {
    public record Row(UUID id, UUID boardId, UUID boardListId, int issueNumber, String columnId,
        String title, String priority, UUID assigneeId, LocalDate dueDate, String updatedAt, boolean canEdit) {}
    public record Counts(long all, long assigned, long overdue, long unassigned) {}
    public record Query(@Min(1) @Max(100_000) int page, @Min(1) @Max(100) int size,
        @Size(max = 500) String text, @Size(max = 30) List<@NotNull @Valid Term> terms,
        @Size(max = 80) List<@NotNull UUID> projects, UUID member, @Size(max = 20) String status,
        @Size(max = 20) String priority, String group, String activity, String scope, String sort,
        LocalDate createdFrom, LocalDate createdTo, LocalDate today) {}
    public record Term(@NotBlank @Pattern(regexp = "project|state|assignee|priority|type|id") String attribute,
        @NotBlank @Size(max = 300) String value, boolean excluded) {}
}

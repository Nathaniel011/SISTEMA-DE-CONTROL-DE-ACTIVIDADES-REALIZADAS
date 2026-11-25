package com.scar.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record GanttPlanDto(UUID id, String name, List<UUID> projectIds, LocalDate startDate, Integer capacity,
    Integer assigneeCapacity, boolean workdaysOnly, boolean syncIssueDates, boolean shared, boolean editable) {

    public record Draft(@NotBlank @Size(max = 100) String name,
        @NotNull @Size(min = 1, max = 20) List<@NotNull UUID> projectIds,
        @NotNull LocalDate startDate, @Min(1) @Max(100) Integer capacity, @Min(1) @Max(100) Integer assigneeCapacity,
        boolean workdaysOnly, boolean syncIssueDates, boolean shared) {}

    public record Selection(@NotNull @Size(max = 250) List<@NotNull UUID> issueIds) {}

    public record Candidate(UUID id, String key, String title, UUID projectId) {}

    public record TaskChange(LocalDate start, LocalDate end, @Min(0) @Max(1_752_000) Integer estimateMinutes, boolean pinned) {}
}

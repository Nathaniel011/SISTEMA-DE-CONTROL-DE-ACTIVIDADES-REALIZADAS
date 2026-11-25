package com.scar.api.dto;

import com.scar.api.domain.enums.IssueColumn;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record ProjectConfigurationDto(List<Field> fields, List<Transition> transitions, boolean canManage) {
    public enum Kind { text, integer, date, booleanValue, enumeration }

    public record Field(UUID id, String name, Kind kind, List<String> options, boolean archived) {}
    public record FieldValue(Field field, String value) {}
    public record FieldDraft(@NotBlank @Size(max = 80) String name, @NotNull Kind kind,
        @Size(max = 30) List<@NotBlank @Size(max = 80) String> options) {}
    public record Transition(@NotNull IssueColumn from, @NotNull IssueColumn to) {}
    public record WorkflowDraft(@Size(max = 56) List<@NotNull @Valid Transition> transitions) {}
}

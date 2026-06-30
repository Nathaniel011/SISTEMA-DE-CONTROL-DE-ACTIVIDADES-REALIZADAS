package com.scar.api.dto;

import jakarta.validation.Valid;
import java.util.List;

public record UpdateProjectMembersRequest(
    @Valid List<MemberAction> actions
) {
    public record MemberAction(
        String userId,
        String action // "add" or "remove"
    ) {}
}

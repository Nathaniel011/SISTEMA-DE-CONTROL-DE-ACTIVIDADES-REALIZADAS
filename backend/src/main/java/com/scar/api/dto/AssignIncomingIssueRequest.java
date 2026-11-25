package com.scar.api.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record AssignIncomingIssueRequest(@NotNull UUID targetBoardId, @NotNull UUID assigneeId) {}

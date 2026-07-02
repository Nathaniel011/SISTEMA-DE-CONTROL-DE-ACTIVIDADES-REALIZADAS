package com.scar.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record UpdateUserRequest(
    @NotBlank String fullName,
    @NotBlank @Email String email,
    List<String> roles,
    boolean active
) {}

package com.scar.api.dto;

import java.util.List;

public record UserDto(
    String id,
    String fullName,
    String username,
    String email,
    List<String> roles,
    boolean active,
    String createdAt,
    String temporaryPassword
) {}

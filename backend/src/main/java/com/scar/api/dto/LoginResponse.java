package com.scar.api.dto;

import java.util.List;

public record LoginResponse(
    String token,
    UserDto user
) {
    public record UserDto(
        String id,
        String fullName,
        String username,
        String email,
        List<String> roles,
        boolean active
    ) {}
}

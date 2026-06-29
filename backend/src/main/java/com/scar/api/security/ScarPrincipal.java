package com.scar.api.security;

import com.scar.api.domain.enums.UserRole;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public record ScarPrincipal(
    UUID userId,
    UUID organizationId,
    String username,
    Set<UserRole> roles
) {
    public Set<SimpleGrantedAuthority> authorities() {
        return roles.stream()
            .map(r -> new SimpleGrantedAuthority("ROLE_" + r.name()))
            .collect(Collectors.toSet());
    }
}

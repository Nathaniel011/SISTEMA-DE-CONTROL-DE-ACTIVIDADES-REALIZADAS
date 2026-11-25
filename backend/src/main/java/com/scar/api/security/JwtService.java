package com.scar.api.security;

import com.scar.api.config.JwtProperties;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class JwtService {

    private final JwtProperties properties;
    private final SecretKey key;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        this.key = properties.secret() == null || properties.secret().isBlank()
            ? Jwts.SIG.HS256.key().build()
            : Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(User user) {
        Instant now = Instant.now();
        Instant expiry = now.plusMillis(properties.expirationMs());
        String roles = user.getRoles().stream().map(Enum::name).collect(Collectors.joining(","));

        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("username", user.getUsername())
            .claim("roles", roles)
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiry))
            .signWith(key)
            .compact();
    }

    public ScarPrincipal parseToken(String token) {
        Claims claims = Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();

        Set<UserRole> roles = Set.of(claims.get("roles", String.class).split(","))
            .stream()
            .filter(s -> !s.isBlank())
            .map(UserRole::valueOf)
            .collect(Collectors.toSet());

        return new ScarPrincipal(
            UUID.fromString(claims.getSubject()),
            claims.get("username", String.class),
            roles
        );
    }
}

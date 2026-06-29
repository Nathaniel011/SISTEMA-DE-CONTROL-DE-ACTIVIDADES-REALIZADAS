package com.scar.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scar.jwt")
public record JwtProperties(String secret, long expirationMs) {}

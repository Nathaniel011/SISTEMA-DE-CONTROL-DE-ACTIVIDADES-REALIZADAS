package com.scar.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scar.cors")
public record CorsProperties(String allowedOrigins) {}

package com.scar.api.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

@Service
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 10;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final ConcurrentMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();
    private final StringRedisTemplate redisTemplate;
    private final boolean redisEnabled;
    private final String redisKeyPrefix;

    public LoginRateLimiter(
        ObjectProvider<StringRedisTemplate> redisTemplateProvider,
        @Value("${scar.security.login-rate-limit.backend:memory}") String backend,
        @Value("${scar.security.login-rate-limit.redis-key-prefix:scar:login-rate}") String redisKeyPrefix
    ) {
        this.redisTemplate = redisTemplateProvider.getIfAvailable();
        this.redisEnabled = "redis".equalsIgnoreCase(backend);
        this.redisKeyPrefix = redisKeyPrefix;
    }

    public void checkAllowed(String key) {
        if (redisEnabled && checkAllowedWithRedis(key)) {
            return;
        }
        AttemptWindow window = attempts.get(key);
        if (window == null) {
            return;
        }
        window.cleanupExpired();
        if (window.count >= MAX_ATTEMPTS) {
            throwTooManyAttempts();
        }
    }

    public void recordFailure(String key) {
        if (redisEnabled && recordFailureWithRedis(key)) {
            return;
        }
        attempts.compute(key, (k, window) -> {
            AttemptWindow current = window == null ? new AttemptWindow() : window;
            current.cleanupExpired();
            current.count++;
            current.lastAttempt = Instant.now();
            return current;
        });
    }

    public void recordSuccess(String key) {
        if (redisEnabled && recordSuccessWithRedis(key)) {
            return;
        }
        attempts.remove(key);
    }

    private boolean checkAllowedWithRedis(String key) {
        if (redisTemplate == null) {
            return false;
        }
        try {
            String count = redisTemplate.opsForValue().get(redisKey(key));
            if (count != null && Integer.parseInt(count) >= MAX_ATTEMPTS) {
                throwTooManyAttempts();
            }
            return true;
        } catch (NumberFormatException ex) {
            redisTemplate.delete(redisKey(key));
            return true;
        } catch (TooManyLoginAttemptsException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private boolean recordFailureWithRedis(String key) {
        if (redisTemplate == null) {
            return false;
        }
        try {
            Long count = redisTemplate.opsForValue().increment(redisKey(key));
            if (count != null && count == 1L) {
                redisTemplate.expire(redisKey(key), WINDOW.toSeconds(), TimeUnit.SECONDS);
            }
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private boolean recordSuccessWithRedis(String key) {
        if (redisTemplate == null) {
            return false;
        }
        try {
            redisTemplate.delete(redisKey(key));
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private String redisKey(String key) {
        String safeKey = key.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9:._-]", "_");
        return redisKeyPrefix + ":" + safeKey;
    }

    private void throwTooManyAttempts() {
        throw new TooManyLoginAttemptsException();
    }

    public static final class TooManyLoginAttemptsException extends RuntimeException {
        public TooManyLoginAttemptsException() {
            super("Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos.");
        }
    }

    private static final class AttemptWindow {
        private int count;
        private Instant lastAttempt = Instant.now();

        private void cleanupExpired() {
            if (Duration.between(lastAttempt, Instant.now()).compareTo(WINDOW) > 0) {
                count = 0;
            }
        }
    }
}

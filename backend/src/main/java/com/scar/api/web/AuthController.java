package com.scar.api.web;

import com.scar.api.dto.ChangePasswordRequest;
import com.scar.api.dto.LoginRequest;
import com.scar.api.dto.LoginResponse;
import com.scar.api.dto.UpdateProfileRequest;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.AuthService;
import com.scar.api.service.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final LoginRateLimiter loginRateLimiter;

    public AuthController(AuthService authService, LoginRateLimiter loginRateLimiter) {
        this.authService = authService;
        this.loginRateLimiter = loginRateLimiter;
    }

    @PostMapping("/login")
    public LoginResponse login(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest httpRequest
    ) {
        String clientKey = resolveClientKey(httpRequest);
        loginRateLimiter.checkAllowed(clientKey);
        try {
            LoginResponse response = authService.login(request);
            loginRateLimiter.recordSuccess(clientKey);
            return response;
        } catch (RuntimeException ex) {
            loginRateLimiter.recordFailure(clientKey);
            throw ex;
        }
    }

    @GetMapping("/me")
    public LoginResponse.UserDto me(@AuthenticationPrincipal ScarPrincipal principal) {
        return authService.me(principal);
    }

    @PutMapping("/password")
    public void changePassword(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody ChangePasswordRequest request
    ) {
        authService.changePassword(principal, request);
    }

    @PutMapping("/profile")
    public LoginResponse.UserDto updateProfile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody UpdateProfileRequest request
    ) {
        return authService.updateProfile(principal, request);
    }

    private String resolveClientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    @ExceptionHandler(LoginRateLimiter.TooManyLoginAttemptsException.class)
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    public Map<String, String> tooManyLoginAttempts(LoginRateLimiter.TooManyLoginAttemptsException ex) {
        return Map.of("message", ex.getMessage());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> authError(ResponseStatusException ex) {
        String message = ex.getReason() == null ? "Error de autenticación" : ex.getReason();
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of("message", message));
    }
}

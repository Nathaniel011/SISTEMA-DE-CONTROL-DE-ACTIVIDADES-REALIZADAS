package com.scar.api.web;

import com.scar.api.dto.ChangePasswordRequest;
import com.scar.api.dto.LoginRequest;
import com.scar.api.dto.LoginResponse;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
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
}

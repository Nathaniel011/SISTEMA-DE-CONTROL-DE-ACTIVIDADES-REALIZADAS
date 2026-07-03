package com.scar.api.web;

import com.scar.api.dto.UserPreferencesDto;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.UserPreferencesService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users/me/preferences")
public class UserPreferencesController {

    private final UserPreferencesService preferencesService;

    public UserPreferencesController(UserPreferencesService preferencesService) {
        this.preferencesService = preferencesService;
    }

    @GetMapping
    public UserPreferencesDto get(@AuthenticationPrincipal ScarPrincipal principal) {
        return preferencesService.get(principal);
    }

    @PutMapping
    public UserPreferencesDto update(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody UserPreferencesDto request
    ) {
        return preferencesService.update(principal, request);
    }
}

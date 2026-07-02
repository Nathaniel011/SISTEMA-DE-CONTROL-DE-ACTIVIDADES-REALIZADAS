package com.scar.api.web;

import com.scar.api.dto.CreateUserRequest;
import com.scar.api.dto.UpdateUserRequest;
import com.scar.api.dto.UserDto;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.UserService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserDto> list(@AuthenticationPrincipal ScarPrincipal principal) {
        return userService.listUsers(principal);
    }

    @GetMapping("/{id}")
    public UserDto get(@AuthenticationPrincipal ScarPrincipal principal, @PathVariable UUID id) {
        return userService.getUser(principal, id);
    }

    @PostMapping
    public UserDto create(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody CreateUserRequest request
    ) {
        return userService.createUser(principal, request);
    }

    @PutMapping("/{id}")
    public UserDto update(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody UpdateUserRequest request
    ) {
        return userService.updateUser(principal, id, request);
    }

    @PatchMapping("/{id}/active")
    public UserDto setActive(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @RequestBody Map<String, Boolean> body
    ) {
        boolean active = body.getOrDefault("active", true);
        return userService.setActive(principal, id, active);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void delete(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        userService.deleteUser(principal, id);
    }
}

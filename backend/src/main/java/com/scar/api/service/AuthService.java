package com.scar.api.service;

import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.dto.ChangePasswordRequest;
import com.scar.api.dto.LoginRequest;
import com.scar.api.dto.LoginResponse;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String identifier = normalizeLoginIdentifier(request.username());
        User user = userRepository.findByUsernameOrEmailIgnoreCase(identifier)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas"));

        if (!user.isActive() || !passwordMatches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas");
        }

        String token = jwtService.generateToken(user);
        return new LoginResponse(token, toUserDto(user));
    }

    @Transactional(readOnly = true)
    public LoginResponse.UserDto me(ScarPrincipal principal) {
        User user = userRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toUserDto(user);
    }

    @Transactional
    public void changePassword(ScarPrincipal principal, ChangePasswordRequest request) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No autenticado");
        }
        if (!request.newPassword().equals(request.confirmPassword())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "La confirmación no coincide con la nueva contraseña"
            );
        }
        if (request.newPassword().equals(request.currentPassword())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "La nueva contraseña debe ser diferente a la actual"
            );
        }

        User user = userRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        if (!passwordMatches(request.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Contraseña actual incorrecta");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
    }

    private String normalizeLoginIdentifier(String raw) {
        String identifier = raw == null ? "" : raw.trim();
        if (identifier.contains("@")) {
            return identifier.toLowerCase(Locale.ROOT);
        }
        return identifier;
    }

    private boolean passwordMatches(String rawPassword, String hash) {
        if (hash == null || (!hash.startsWith("$2a$") && !hash.startsWith("$2b$") && !hash.startsWith("$2y$"))) {
            return false;
        }
        return passwordEncoder.matches(rawPassword, hash);
    }

    private LoginResponse.UserDto toUserDto(User user) {
        return new LoginResponse.UserDto(
            user.getId().toString(),
            user.getFullName(),
            user.getUsername(),
            user.getEmail(),
            user.getRoles().stream().map(UserRole::name).toList(),
            user.isActive()
        );
    }
}

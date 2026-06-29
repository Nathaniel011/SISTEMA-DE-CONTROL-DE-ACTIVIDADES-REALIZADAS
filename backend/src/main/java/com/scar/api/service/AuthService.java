package com.scar.api.service;

import com.scar.api.domain.entity.Organization;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.dto.LoginRequest;
import com.scar.api.dto.LoginResponse;
import com.scar.api.repository.OrganizationRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class AuthService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        JwtService jwtService
    ) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        String slug = request.organizationSlug() != null && !request.organizationSlug().isBlank()
            ? request.organizationSlug()
            : "scar";

        Organization org = organizationRepository.findBySlug(slug)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Organización no encontrada"));

        User user = userRepository.findByOrganizationIdAndUsername(org.getId(), request.username())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas"));

        if (!user.isActive() || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas");
        }

        String token = jwtService.generateToken(user);
        return new LoginResponse(token, toUserDto(user), new LoginResponse.OrganizationDto(
            org.getId().toString(), org.getName(), org.getSlug()
        ));
    }

    @Transactional(readOnly = true)
    public LoginResponse.UserDto me(ScarPrincipal principal) {
        User user = userRepository.findById(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toUserDto(user);
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

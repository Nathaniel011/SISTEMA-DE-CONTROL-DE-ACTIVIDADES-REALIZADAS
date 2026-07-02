package com.scar.api.service;

import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.dto.CreateUserRequest;
import com.scar.api.dto.UpdateUserRequest;
import com.scar.api.dto.UserDto;
import com.scar.api.repository.UserRepository;
import com.scar.api.repository.IssueRepository;
import com.scar.api.security.ScarPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PermissionService permissionService;
    private final IssueRepository issueRepository;
    private final JdbcTemplate jdbcTemplate;

    public UserService(
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        PermissionService permissionService,
        IssueRepository issueRepository,
        JdbcTemplate jdbcTemplate
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.permissionService = permissionService;
        this.issueRepository = issueRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public List<UserDto> listUsers(ScarPrincipal principal) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);
        return userRepository.findAllWithRoles().stream()
            .map(u -> toDto(u, null))
            .toList();
    }

    @Transactional(readOnly = true)
    public UserDto getUser(ScarPrincipal principal, UUID id) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);
        User user = userRepository.findByIdWithRoles(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        return toDto(user, null);
    }

    @Transactional
    public UserDto createUser(ScarPrincipal principal, CreateUserRequest request) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);

        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El correo ya está registrado");
        }

        Set<UserRole> roles = request.roles() == null || request.roles().isEmpty()
            ? Set.of()
            : parseRoles(request.roles());
        if (!roles.isEmpty()) {
            validateAssignableRoles(current, roles, null);
        }

        String tempPassword = request.password() != null && !request.password().isBlank()
            ? request.password()
            : generatePassword();

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setUsername(generateUniqueUsername(request.fullName().trim()));
        user.setInitials(generateInitials(request.fullName().trim()));
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setActive(request.active());
        user.setRoles(roles);

        user = userRepository.save(user);
        return toDto(user, tempPassword);
    }

    @Transactional
    public UserDto updateUser(ScarPrincipal principal, UUID id, UpdateUserRequest request) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);

        User user = userRepository.findByIdWithRoles(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        String email = request.email().trim().toLowerCase();
        userRepository.findByEmail(email).ifPresent(existing -> {
            if (!existing.getId().equals(id)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "El correo ya está registrado");
            }
        });

        Set<UserRole> roles = request.roles() == null || request.roles().isEmpty()
            ? Set.of()
            : parseRoles(request.roles());
        if (!roles.isEmpty()) {
            validateAssignableRoles(current, roles, id);
        }

        user.setFullName(request.fullName().trim());
        user.setEmail(email);
        user.setInitials(generateInitials(request.fullName().trim()));
        user.setActive(request.active());
        user.setRoles(roles);

        user = userRepository.save(user);
        return toDto(user, null);
    }

    @Transactional
    public void deleteUser(ScarPrincipal principal, UUID id) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);

        if (current.getId().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puede eliminar su propia cuenta");
        }

        User user = userRepository.findByIdWithRoles(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

        if (user.getRoles().contains(UserRole.ADMIN) && userRepository.countAdmins() <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede eliminar el último administrador");
        }

        issueRepository.clearAssigneeByUserId(id);
        jdbcTemplate.update("DELETE FROM activity_log WHERE user_id = ?", id);
        userRepository.delete(user);
    }

    @Transactional
    public UserDto setActive(ScarPrincipal principal, UUID id, boolean active) {
        User current = loadUser(principal.userId());
        permissionService.requireManageUsers(current);

        User user = userRepository.findByIdWithRoles(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        user.setActive(active);
        user = userRepository.save(user);
        return toDto(user, null);
    }

    private void validateAssignableRoles(User current, Set<UserRole> roles, UUID targetUserId) {
        if (roles.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un usuario solo puede tener un rol");
        }
        if (roles.contains(UserRole.CHIEF)) {
            boolean chiefTaken = targetUserId == null
                ? userRepository.existsChief()
                : userRepository.existsOtherChief(targetUserId);
            if (chiefTaken) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Solo puede existir una jefa en el sistema");
            }
        }
        if (permissionService.isAdmin(current)) {
            return;
        }
        if (permissionService.isChief(current)) {
            for (UserRole role : roles) {
                if (role == UserRole.ADMIN || role == UserRole.CHIEF) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La jefa solo puede asignar el rol de secretaria");
                }
            }
            return;
        }
        for (UserRole role : roles) {
            if (role == UserRole.ADMIN || role == UserRole.CHIEF || role == UserRole.SECRETARY) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede asignar roles de gestión");
            }
        }
    }

    private Set<UserRole> parseRoles(List<String> roles) {
        try {
            return roles.stream()
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(UserRole::valueOf)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol no válido");
        }
    }

    private User loadUser(UUID id) {
        return userRepository.findByIdWithRoles(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private UserDto toDto(User user, String temporaryPassword) {
        return new UserDto(
            user.getId().toString(),
            user.getFullName(),
            user.getUsername(),
            user.getEmail(),
            user.getRoles().stream().map(Enum::name).toList(),
            user.isActive(),
            user.getCreatedAt().toString(),
            temporaryPassword
        );
    }

    private String generateUniqueUsername(String fullName) {
        String base = generateUsernameBase(fullName);
        String candidate = base;
        int counter = 1;
        while (userRepository.existsByUsername(candidate)) {
            candidate = base + counter;
            counter++;
        }
        return candidate;
    }

    private String generateUsernameBase(String fullName) {
        String normalized = Normalizer.normalize(fullName, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .trim();
        String[] parts = normalized.split("\\s+");
        if (parts.length == 0) {
            return "usuario";
        }
        String first = parts[0];
        String last = parts[parts.length - 1];
        String candidate = (first.charAt(0) + last).replaceAll("[^a-z0-9]", "");
        return candidate.isBlank() ? "usuario" : candidate;
    }

    private String generateInitials(String fullName) {
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 0) {
            return "??";
        }
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase(Locale.ROOT);
        }
        return ("" + parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase(Locale.ROOT);
    }

    private String generatePassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}

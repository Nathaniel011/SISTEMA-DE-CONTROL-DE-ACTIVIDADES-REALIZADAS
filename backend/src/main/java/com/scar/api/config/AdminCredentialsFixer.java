package com.scar.api.config;

import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.repository.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Component
public class AdminCredentialsFixer implements ApplicationRunner {

    private static final String ADMIN_USERNAME = "administrador";
    private static final String ADMIN_EMAIL = "admin@gmail.com";
    private static final String ADMIN_PASSWORD = "password";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminCredentialsFixer(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        findAdminUser().ifPresent(this::normalizeAdminAccount);
    }

    private Optional<User> findAdminUser() {
        for (String identifier : new String[]{
            ADMIN_USERNAME,
            "adminitrador",
            "pcondori",
            "pedro.condori@scar.local",
            ADMIN_EMAIL
        }) {
            Optional<User> user = userRepository.findByUsernameOrEmailIgnoreCase(identifier);
            if (user.isPresent() && user.get().getRoles().contains(UserRole.ADMIN)) {
                return user;
            }
        }
        return userRepository.findAllWithRoles().stream()
            .filter(user -> user.getRoles().contains(UserRole.ADMIN))
            .findFirst();
    }

    private void normalizeAdminAccount(User admin) {
        boolean changed = false;

        if (!ADMIN_USERNAME.equals(admin.getUsername())) {
            admin.setUsername(ADMIN_USERNAME);
            changed = true;
        }

        if (!ADMIN_EMAIL.equalsIgnoreCase(admin.getEmail())) {
            admin.setEmail(ADMIN_EMAIL);
            changed = true;
        }

        String hash = admin.getPasswordHash();
        if (!isValidPassword(hash)) {
            admin.setPasswordHash(passwordEncoder.encode(ADMIN_PASSWORD));
            changed = true;
        }

        if (changed) {
            userRepository.save(admin);
        }
    }

    private boolean isValidPassword(String hash) {
        if (hash == null || (!hash.startsWith("$2a$") && !hash.startsWith("$2b$") && !hash.startsWith("$2y$"))) {
            return false;
        }
        return passwordEncoder.matches(ADMIN_PASSWORD, hash);
    }
}

package com.scar.api.config;

import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Component
@ConditionalOnProperty(name = "scar.dev.auto-fix-admin", havingValue = "true", matchIfMissing = false)
public class AdminCredentialsFixer implements ApplicationRunner {

    private static final String ADMIN_USERNAME = "administrador";
    private static final String ADMIN_EMAIL = "admin@gmail.com";
    private final String recoveryPassword;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminCredentialsFixer(UserRepository userRepository, PasswordEncoder passwordEncoder,
                                @Value("${scar.bootstrap.admin-password:}") String recoveryPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.recoveryPassword = recoveryPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (recoveryPassword.isBlank()) return;
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
        // Solo repara hashes rotos/ausentes. No fuerza la contraseña a "password" si ya es un bcrypt válido.
        if (!isValidBcryptHash(hash)) {
            admin.setPasswordHash(passwordEncoder.encode(recoveryPassword));
            changed = true;
        }

        if (changed) {
            userRepository.save(admin);
        }
    }

    private boolean isValidBcryptHash(String hash) {
        return hash != null
            && (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$"));
    }
}

package com.scar.api.service;

import com.scar.api.domain.entity.User;
import com.scar.api.domain.entity.UserPreferences;
import com.scar.api.dto.UserPreferencesDto;
import com.scar.api.repository.UserPreferencesRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class UserPreferencesService {

    private final UserPreferencesRepository preferencesRepository;
    private final UserRepository userRepository;

    public UserPreferencesService(
        UserPreferencesRepository preferencesRepository,
        UserRepository userRepository
    ) {
        this.preferencesRepository = preferencesRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public UserPreferencesDto get(ScarPrincipal principal) {
        return new UserPreferencesDto(loadOrDefault(principal.userId()).getActiveIssueFilter());
    }

    @Transactional
    public UserPreferencesDto update(ScarPrincipal principal, UserPreferencesDto request) {
        UserPreferences prefs = loadOrDefault(principal.userId());
        prefs.setActiveIssueFilter(request.activeIssueFilter());
        return new UserPreferencesDto(preferencesRepository.save(prefs).getActiveIssueFilter());
    }

    private UserPreferences loadOrDefault(UUID userId) {
        return preferencesRepository.findById(userId).orElseGet(() -> {
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
            UserPreferences prefs = new UserPreferences();
            prefs.setUser(user);
            prefs.setActiveIssueFilter("all");
            return preferencesRepository.save(prefs);
        });
    }
}

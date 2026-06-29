package com.scar.api.service;

import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.entity.Whiteboard;
import com.scar.api.dto.WhiteboardDto;
import com.scar.api.dto.WhiteboardRequest;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.repository.WhiteboardRepository;
import com.scar.api.security.ScarPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class WhiteboardService {

    private final WhiteboardRepository whiteboardRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final Map<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public WhiteboardService(
        WhiteboardRepository whiteboardRepository,
        ProjectRepository projectRepository,
        UserRepository userRepository
    ) {
        this.whiteboardRepository = whiteboardRepository;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WhiteboardDto> list(ScarPrincipal principal, UUID projectId) {
        return whiteboardRepository.findForProject(projectId).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public WhiteboardDto get(ScarPrincipal principal, UUID id) {
        return toDto(loadWhiteboard(id));
    }

    @Transactional
    public WhiteboardDto create(ScarPrincipal principal, WhiteboardRequest request) {
        Whiteboard board = new Whiteboard();
        board.setProject(loadProject(request.projectId()));
        board.setName(requiredName(request.name()));
        board.setDescription(request.description() == null ? "" : request.description());
        board.setContentJson(validContent(request.contentJson()));
        board.setUpdatedBy(loadUser(principal.userId()));
        return toDto(whiteboardRepository.save(board));
    }

    @Transactional
    public WhiteboardDto update(ScarPrincipal principal, UUID id, WhiteboardRequest request) {
        Whiteboard board = loadWhiteboard(id);
        if (request.projectId() != null) {
            board.setProject(loadProject(request.projectId()));
        }
        if (request.name() != null) {
            board.setName(requiredName(request.name()));
        }
        if (request.description() != null) {
            board.setDescription(request.description());
        }
        if (request.contentJson() != null) {
            board.setContentJson(validContent(request.contentJson()));
        }
        board.setUpdatedBy(loadUser(principal.userId()));
        WhiteboardDto dto = toDto(whiteboardRepository.save(board));
        broadcast(id, dto);
        return dto;
    }

    @Transactional
    public void delete(ScarPrincipal principal, UUID id) {
        whiteboardRepository.delete(loadWhiteboard(id));
        broadcastDeleted(id);
    }

    @Transactional(readOnly = true)
    public SseEmitter subscribe(ScarPrincipal principal, UUID id) {
        WhiteboardDto current = toDto(loadWhiteboard(id));
        SseEmitter emitter = new SseEmitter(0L);
        emitters.computeIfAbsent(id, key -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> removeEmitter(id, emitter));
        emitter.onTimeout(() -> removeEmitter(id, emitter));
        emitter.onError(error -> removeEmitter(id, emitter));
        send(emitter, "whiteboard", current);
        return emitter;
    }

    private Whiteboard loadWhiteboard(UUID id) {
        return whiteboardRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pizarra no encontrada"));
    }

    private User loadUser(UUID id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private Project loadProject(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return null;
        }
        return projectRepository.findById(UUID.fromString(projectId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
    }

    private String requiredName(String name) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre es obligatorio");
        }
        return name.trim();
    }

    private String validContent(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) {
            return "{\"elements\":[]}";
        }
        return contentJson;
    }

    private void broadcast(UUID id, WhiteboardDto dto) {
        CopyOnWriteArrayList<SseEmitter> list = emitters.get(id);
        if (list == null) {
            return;
        }
        for (SseEmitter emitter : list) {
            if (!send(emitter, "whiteboard", dto)) {
                removeEmitter(id, emitter);
            }
        }
    }

    private void broadcastDeleted(UUID id) {
        CopyOnWriteArrayList<SseEmitter> list = emitters.get(id);
        if (list == null) {
            return;
        }
        for (SseEmitter emitter : list) {
            if (!send(emitter, "deleted", id.toString())) {
                removeEmitter(id, emitter);
            }
        }
    }

    private boolean send(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
            return true;
        } catch (IOException | IllegalStateException ex) {
            return false;
        }
    }

    private void removeEmitter(UUID id, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> list = emitters.get(id);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(id);
            }
        }
    }

    private WhiteboardDto toDto(Whiteboard board) {
        return new WhiteboardDto(
            board.getId().toString(),
            board.getProject() != null ? board.getProject().getId().toString() : null,
            board.getProject() != null ? board.getProject().getName() : null,
            board.getName(),
            board.getDescription(),
            board.getContentJson(),
            board.getUpdatedBy() != null ? board.getUpdatedBy().getFullName() : null,
            board.getCreatedAt().toString(),
            board.getUpdatedAt().toString()
        );
    }
}

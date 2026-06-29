package com.scar.api.web;

import com.scar.api.dto.WhiteboardDto;
import com.scar.api.dto.WhiteboardRequest;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.WhiteboardService;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/whiteboards")
public class WhiteboardController {

    private final WhiteboardService whiteboardService;

    public WhiteboardController(WhiteboardService whiteboardService) {
        this.whiteboardService = whiteboardService;
    }

    @GetMapping
    public List<WhiteboardDto> list(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId
    ) {
        return whiteboardService.list(principal, projectId);
    }

    @GetMapping("/{id}")
    public WhiteboardDto get(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        return whiteboardService.get(principal, id);
    }

    @PostMapping
    public WhiteboardDto create(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestBody WhiteboardRequest request
    ) {
        return whiteboardService.create(principal, request);
    }

    @PutMapping("/{id}")
    public WhiteboardDto update(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @RequestBody WhiteboardRequest request
    ) {
        return whiteboardService.update(principal, id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        whiteboardService.delete(principal, id);
    }

    @GetMapping(path = "/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        return whiteboardService.subscribe(principal, id);
    }
}

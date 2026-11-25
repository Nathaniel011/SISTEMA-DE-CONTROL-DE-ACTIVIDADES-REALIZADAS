package com.scar.api.web;

import com.scar.api.dto.KnowledgeArticleDto;
import com.scar.api.dto.KnowledgeArticleRequest;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.KnowledgeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/knowledge/articles")
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    public KnowledgeController(KnowledgeService knowledgeService) {
        this.knowledgeService = knowledgeService;
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> knowledgeError(ResponseStatusException error) {
        String message = error.getReason() == null ? "No se pudo completar la operación" : error.getReason();
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", message));
    }

    @GetMapping
    public List<KnowledgeArticleDto> list(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam(required = false) UUID projectId,
        @RequestParam(required = false) String q
    ) {
        return knowledgeService.list(principal, projectId, q);
    }

    @GetMapping("/{id}")
    public KnowledgeArticleDto get(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        return knowledgeService.get(principal, id);
    }

    @PostMapping
    public KnowledgeArticleDto create(
        @AuthenticationPrincipal ScarPrincipal principal,
        @Valid @RequestBody KnowledgeArticleRequest request
    ) {
        return knowledgeService.create(principal, request);
    }

    @PutMapping("/{id}")
    public KnowledgeArticleDto update(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @Valid @RequestBody KnowledgeArticleRequest request
    ) {
        return knowledgeService.update(principal, id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        knowledgeService.delete(principal, id);
    }
}

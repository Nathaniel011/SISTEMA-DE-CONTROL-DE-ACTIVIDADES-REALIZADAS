package com.scar.api.web;

import com.scar.api.dto.KnowledgeArticleDto;
import com.scar.api.dto.KnowledgeArticleRequest;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.KnowledgeService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/knowledge/articles")
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    public KnowledgeController(KnowledgeService knowledgeService) {
        this.knowledgeService = knowledgeService;
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
        @RequestBody KnowledgeArticleRequest request
    ) {
        return knowledgeService.create(principal, request);
    }

    @PutMapping("/{id}")
    public KnowledgeArticleDto update(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id,
        @RequestBody KnowledgeArticleRequest request
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

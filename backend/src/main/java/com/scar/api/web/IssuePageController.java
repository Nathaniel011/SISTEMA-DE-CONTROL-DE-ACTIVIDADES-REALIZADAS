package com.scar.api.web;

import com.scar.api.dto.IssuePageDto;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.IssuePageService;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/work/issues")
public class IssuePageController {
    private final IssuePageService issues;

    public IssuePageController(IssuePageService issues) { this.issues = issues; }

    @PostMapping("/search")
    public IssuePageDto search(@AuthenticationPrincipal ScarPrincipal principal, @Valid @RequestBody IssuePageDto.Query query) {
        return issues.find(principal, query);
    }

    @GetMapping("/board-counts")
    public Map<UUID, IssuePageService.BoardCount> counts(@AuthenticationPrincipal ScarPrincipal principal) {
        return issues.counts(principal);
    }
}

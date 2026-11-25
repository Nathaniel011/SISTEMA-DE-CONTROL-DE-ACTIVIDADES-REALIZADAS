package com.scar.api.web;

import com.scar.api.dto.HelpdeskDto;
import com.scar.api.service.WorkService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/public")
public class PublicHelpdeskController {
    private static final int MAX_PER_ADDRESS = 8;
    private static final int MAX_PER_WINDOW = 80;
    private final WorkService work;
    private final boolean intakeEnabled;
    private final Map<String, Integer> submissions = new HashMap<>();
    private long window = -1;
    private int total;

    public PublicHelpdeskController(WorkService work, @Value("${scar.helpdesk.public-intake-enabled:false}") boolean intakeEnabled) {
        this.work = work;
        this.intakeEnabled = intakeEnabled;
    }

    @GetMapping("/requests/availability")
    public ResponseEntity<Map<String, Boolean>> availability() {
        return noStore(HttpStatus.OK).body(Map.of("enabled", intakeEnabled));
    }

    @PostMapping(value = "/requests", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HelpdeskDto.Receipt> submit(@Valid @RequestBody HelpdeskDto.Submission request, HttpServletRequest http) {
        if (!intakeEnabled) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!allowSubmission(http.getRemoteAddr())) {
            return noStore(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "600").build();
        }
        return noStore(HttpStatus.CREATED).body(work.submitPublicRequest(request));
    }

    @GetMapping("/tracking/{token}")
    public ResponseEntity<HelpdeskDto.Tracking> tracking(@PathVariable String token) {
        return noStore(HttpStatus.OK).body(work.getPublicTracking(token));
    }

    private synchronized boolean allowSubmission(String address) {
        long current = Instant.now().getEpochSecond() / 600;
        if (window != current) {
            window = current;
            total = 0;
            submissions.clear();
        }
        int count = submissions.getOrDefault(address, 0);
        if (count >= MAX_PER_ADDRESS || total >= MAX_PER_WINDOW) return false;
        total++;
        submissions.put(address, count + 1);
        return true;
    }

    private ResponseEntity.BodyBuilder noStore(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer");
    }
}

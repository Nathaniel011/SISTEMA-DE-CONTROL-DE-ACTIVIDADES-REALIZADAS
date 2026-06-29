package com.scar.api.web;

import com.scar.api.dto.CreateIssueRequest;
import com.scar.api.service.WorkService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/webhooks")
public class WebhookController {

    private final WorkService workService;
    private final String emailWebhookSecret;

    public WebhookController(
        WorkService workService,
        @Value("${scar.webhooks.email.secret:}") String emailWebhookSecret
    ) {
        this.workService = workService;
        this.emailWebhookSecret = emailWebhookSecret;
    }

    @PostMapping("/email-ticket")
    public ResponseEntity<?> emailTicket(
        @RequestHeader(value = "X-Webhook-Secret", required = false) String secret,
        @Valid @RequestBody EmailTicketRequest request
    ) {
        if (emailWebhookSecret != null && !emailWebhookSecret.isBlank() && !emailWebhookSecret.equals(secret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid secret");
        }

        try {
            // Find the first project or a default project for email tickets
            // For now, we'll need to pass the boardId in the request or use a default
            UUID boardId = request.boardId() != null ? UUID.fromString(request.boardId()) : null;
            
            if (boardId == null) {
                return ResponseEntity.badRequest().body("boardId is required");
            }

            CreateIssueRequest createReq = new CreateIssueRequest(
                boardId.toString(),
                request.subject(),
                "task",
                "registered",
                request.senderName(),
                request.senderPhone(),
                request.senderEmail(),
                "correo"
            );

            var card = workService.createIssue(null, createReq);
            if (request.body() != null && !request.body().isBlank()) {
                card = workService.updateWebhookIssueDescription(UUID.fromString(card.id()), request.body());
            }
            
            return ResponseEntity.ok(new EmailTicketResponse(
                card.id(),
                "Ticket created successfully"
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Error creating ticket: " + e.getMessage());
        }
    }

    public record EmailTicketRequest(
        String subject,
        String body,
        String senderEmail,
        String senderName,
        String senderPhone,
        String boardId,
        java.util.List<String> attachments
    ) {}

    public record EmailTicketResponse(
        String issueId,
        String message
    ) {}
}

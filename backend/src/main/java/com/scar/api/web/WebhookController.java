package com.scar.api.web;

import com.scar.api.domain.entity.Project;
import com.scar.api.dto.CreateIssueRequest;
import com.scar.api.service.GeneralBoardService;
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
    private final GeneralBoardService generalBoardService;
    private final String emailWebhookSecret;

    public WebhookController(
        WorkService workService,
        GeneralBoardService generalBoardService,
        @Value("${scar.webhooks.email.secret:}") String emailWebhookSecret
    ) {
        this.workService = workService;
        this.generalBoardService = generalBoardService;
        this.emailWebhookSecret = emailWebhookSecret;
    }

    @PostMapping("/email-ticket")
    public ResponseEntity<?> emailTicket(
        @RequestHeader(value = "X-Webhook-Secret", required = false) String secret,
        @Valid @RequestBody EmailTicketRequest request
    ) {
        if (emailWebhookSecret == null || emailWebhookSecret.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Webhook no configurado");
        }
        if (!emailWebhookSecret.equals(secret)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid secret");
        }

        try {
            Project generalBoard = generalBoardService.ensureGeneralBoardExists();

            CreateIssueRequest createReq = new CreateIssueRequest(
                generalBoard.getId().toString(),
                request.subject(),
                "registered",
                null,
                null,
                null,
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

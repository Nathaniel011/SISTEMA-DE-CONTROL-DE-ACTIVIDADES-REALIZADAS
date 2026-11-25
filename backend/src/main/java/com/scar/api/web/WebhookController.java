package com.scar.api.web;

import com.scar.api.domain.entity.Project;
import com.scar.api.dto.CreateIssueRequest;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.service.GeneralBoardService;
import com.scar.api.service.WorkService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@RestController
@RequestMapping("/api/webhooks")
public class WebhookController {

    private final WorkService workService;
    private final GeneralBoardService generalBoardService;
    private final ProjectRepository projectRepository;
    private final String emailWebhookSecret;

    public WebhookController(
        WorkService workService,
        GeneralBoardService generalBoardService,
        ProjectRepository projectRepository,
        @Value("${scar.webhooks.email.secret:}") String emailWebhookSecret
    ) {
        this.workService = workService;
        this.generalBoardService = generalBoardService;
        this.projectRepository = projectRepository;
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
        if (secret == null || !MessageDigest.isEqual(emailWebhookSecret.getBytes(StandardCharsets.UTF_8),
            secret.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid secret");
        }

        try {
            Project targetBoard = resolveTargetBoard(request.boardId());

            String description = buildDescription(request.body(), request.attachments());

            CreateIssueRequest createReq = new CreateIssueRequest(
                targetBoard.getId().toString(),
                request.subject(),
                "registered",
                null,
                null,
                null,
                request.senderName(),
                request.senderPhone(),
                request.senderEmail(),
                "correo",
                description.length() > 10000 ? description.substring(0, 10000) : description
            );

            var card = workService.createIssue(null, createReq);

            return ResponseEntity.ok(new EmailTicketResponse(
                card.id(),
                "Ticket created successfully"
            ));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("No se pudo crear el ticket");
        }
    }

    private Project resolveTargetBoard(String boardId) {
        if (boardId != null && !boardId.isBlank()) {
            return projectRepository.findById(UUID.fromString(boardId))
                .orElseGet(generalBoardService::ensureGeneralBoardExists);
        }
        return generalBoardService.ensureGeneralBoardExists();
    }

    private String buildDescription(String body, java.util.List<String> attachments) {
        StringBuilder description = new StringBuilder(body != null ? body : "");
        if (attachments != null && !attachments.isEmpty()) {
            if (!description.isEmpty()) {
                description.append("\n\n");
            }
            description.append("Adjuntos:\n");
            attachments.stream()
                .filter(a -> a != null && !a.isBlank())
                .forEach(a -> description.append("- ").append(a.trim()).append('\n'));
        }
        return description.toString().trim();
    }

    public record EmailTicketRequest(
        @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 500) String subject,
        @jakarta.validation.constraints.Size(max = 10000) String body,
        @jakarta.validation.constraints.Email @jakarta.validation.constraints.Size(max = 254) String senderEmail,
        @jakarta.validation.constraints.Size(max = 160) String senderName,
        @jakarta.validation.constraints.Size(max = 50) String senderPhone,
        String boardId,
        @jakarta.validation.constraints.Size(max = 20) java.util.List<@jakarta.validation.constraints.Size(max = 500) String> attachments
    ) {}

    public record EmailTicketResponse(
        String issueId,
        String message
    ) {}
}

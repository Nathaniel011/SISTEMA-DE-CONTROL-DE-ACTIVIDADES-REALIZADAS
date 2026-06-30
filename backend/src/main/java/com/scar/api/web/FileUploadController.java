package com.scar.api.web;

import com.scar.api.domain.entity.Attachment;
import com.scar.api.repository.AttachmentRepository;
import com.scar.api.repository.IssueRepository;
import com.scar.api.security.ScarPrincipal;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final AttachmentRepository attachmentRepository;
    private final IssueRepository issueRepository;
    private final String uploadDir;

    public FileUploadController(
        AttachmentRepository attachmentRepository,
        IssueRepository issueRepository
    ) {
        this.attachmentRepository = attachmentRepository;
        this.issueRepository = issueRepository;
        this.uploadDir = System.getenv("UPLOAD_DIR") != null 
            ? System.getenv("UPLOAD_DIR") 
            : "./uploads";
        try {
            Files.createDirectories(Paths.get(uploadDir));
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload directory", e);
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadFile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam("file") @NotNull MultipartFile file,
        @RequestParam("issueId") UUID issueId
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("File is empty");
        }

        try {
            String originalFilename = file.getOriginalFilename();
            String extension = originalFilename != null && originalFilename.contains(".")
                ? originalFilename.substring(originalFilename.lastIndexOf("."))
                : "";
            String uniqueFilename = UUID.randomUUID() + extension;
            Path filePath = Paths.get(uploadDir, uniqueFilename);
            
            Files.copy(file.getInputStream(), filePath);

            Attachment attachment = new Attachment();
            attachment.setIssue(issueRepository.findById(issueId)
                .orElseThrow(() -> new IllegalArgumentException("Issue not found")));
            attachment.setFileName(originalFilename);
            attachment.setFileUrl("/api/files/" + uniqueFilename);
            attachment.setMimeType(file.getContentType());
            attachment.setFileSize(file.getSize());
            attachment.setUploadedBy(principal.userId());
            
            attachment = attachmentRepository.save(attachment);

            return ResponseEntity.ok(new FileUploadResponse(
                attachment.getId().toString(),
                attachment.getFileUrl(),
                attachment.getFileName(),
                attachment.getMimeType(),
                attachment.getFileSize()
            ));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to upload file: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteFile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        Attachment attachment = attachmentRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Attachment not found"));
        
        try {
            String filename = attachment.getFileUrl().replace("/api/files/", "");
            Path filePath = Paths.get(uploadDir, filename);
            Files.deleteIfExists(filePath);
            attachmentRepository.delete(attachment);
            return ResponseEntity.ok().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to delete file: " + e.getMessage());
        }
    }

    public record FileUploadResponse(
        String id,
        String url,
        String fileName,
        String mimeType,
        Long fileSize
    ) {}
}

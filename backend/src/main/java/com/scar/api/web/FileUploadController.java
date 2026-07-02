package com.scar.api.web;

import com.scar.api.domain.entity.Attachment;
import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.User;
import com.scar.api.repository.AttachmentRepository;
import com.scar.api.repository.IssueRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.PermissionService;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "pdf"
    );

    private final AttachmentRepository attachmentRepository;
    private final IssueRepository issueRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;
    private final String uploadDir;

    public FileUploadController(
        AttachmentRepository attachmentRepository,
        IssueRepository issueRepository,
        UserRepository userRepository,
        PermissionService permissionService,
        @Value("${scar.upload.dir:./uploads}") String uploadDir
    ) {
        this.attachmentRepository = attachmentRepository;
        this.issueRepository = issueRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
        this.uploadDir = uploadDir;
        try {
            Files.createDirectories(Paths.get(uploadDir));
        } catch (IOException e) {
            throw new RuntimeException("Could not create upload directory", e);
        }
    }

    @GetMapping("/{filename}")
    @Transactional(readOnly = true)
    public ResponseEntity<Resource> downloadFile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable String filename
    ) throws IOException {
        User currentUser = loadUser(principal);
        Attachment attachment = attachmentRepository.findByFileUrlWithIssue("/api/files/" + filename)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Archivo no encontrado"));
        permissionService.requireAccessProject(currentUser, attachment.getIssue().getProject());

        Path filePath = Paths.get(uploadDir, filename);
        if (!Files.exists(filePath)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Archivo no encontrado");
        }
        Resource resource = new UrlResource(filePath.toUri());
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
            .contentType(MediaType.parseMediaType(attachment.getMimeType()))
            .body(resource);
    }

    @PostMapping("/upload")
    @Transactional
    public ResponseEntity<?> uploadFile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @RequestParam("file") @NotNull MultipartFile file,
        @RequestParam("issueId") UUID issueId
    ) {
        User currentUser = loadUser(principal);
        Issue issue = issueRepository.findByIdWithAccessDetails(issueId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Incidencia no encontrada"));
        permissionService.requireAccessProject(currentUser, issue.getProject());
        permissionService.requireUpdateIssue(currentUser, issue, null);

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body("El archivo está vacío");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            return ResponseEntity.badRequest().body("Archivo demasiado grande (máx. 10 MB)");
        }
        String originalFilename = sanitizeFilename(file.getOriginalFilename());
        if (!isAllowedFile(originalFilename, file.getContentType())) {
            return ResponseEntity.badRequest().body("Solo se permiten imágenes y archivos PDF");
        }
        String mimeType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        try {
            String extension = originalFilename.contains(".")
                ? originalFilename.substring(originalFilename.lastIndexOf('.'))
                : "";
            String uniqueFilename = UUID.randomUUID() + extension;
            Path filePath = Paths.get(uploadDir, uniqueFilename);
            Files.copy(file.getInputStream(), filePath);

            Attachment attachment = new Attachment();
            attachment.setIssue(issue);
            attachment.setFileName(originalFilename);
            attachment.setFileUrl("/api/files/" + uniqueFilename);
            attachment.setMimeType(mimeType);
            attachment.setFileSize(file.getSize());
            attachment.setUploadedBy(principal.userId());
            attachment = attachmentRepository.save(attachment);

            return ResponseEntity.ok(new FileUploadResponse(
                attachment.getId().toString(),
                attachment.getFileUrl(),
                attachment.getFileName(),
                attachment.getMimeType(),
                attachment.getFileSize(),
                attachment.getCreatedAt().toString()
            ));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("Failed to upload file: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> deleteFile(
        @AuthenticationPrincipal ScarPrincipal principal,
        @PathVariable UUID id
    ) {
        User currentUser = loadUser(principal);
        Attachment attachment = attachmentRepository.findByIdWithIssue(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Adjunto no encontrado"));
        Issue issue = attachment.getIssue();
        permissionService.requireAccessProject(currentUser, issue.getProject());
        permissionService.requireUpdateIssue(currentUser, issue, null);

        try {
            String filename = attachment.getFileUrl().replace("/api/files/", "");
            Files.deleteIfExists(Paths.get(uploadDir, filename));
            attachmentRepository.delete(attachment);
            return ResponseEntity.noContent().build();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo eliminar el archivo");
        }
    }

    private User loadUser(ScarPrincipal principal) {
        return userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private boolean isAllowedFile(String filename, String mimeType) {
        String extension = fileExtension(filename);
        if (extension != null && ALLOWED_EXTENSIONS.contains(extension)) {
            return true;
        }
        if (mimeType == null || mimeType.isBlank()) {
            return false;
        }
        return mimeType.startsWith("image/") || "application/pdf".equalsIgnoreCase(mimeType);
    }

    private String fileExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return null;
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "archivo";
        }
        return filename.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    public record FileUploadResponse(
        String id,
        String url,
        String fileName,
        String mimeType,
        Long fileSize,
        String createdAt
    ) {}
}

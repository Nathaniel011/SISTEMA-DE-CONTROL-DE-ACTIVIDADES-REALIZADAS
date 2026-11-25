package com.scar.api.web;

import com.scar.api.domain.entity.BoardList;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.dto.BoardListDto;
import com.scar.api.dto.CreateBoardListRequest;
import com.scar.api.dto.UpdateBoardListRequest;
import com.scar.api.repository.BoardListRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import com.scar.api.security.ScarPrincipal;
import com.scar.api.service.PermissionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects/{projectId}/lists")
public class BoardListController {

    private final BoardListRepository boardListRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;

    public BoardListController(
        BoardListRepository boardListRepository,
        ProjectRepository projectRepository,
        UserRepository userRepository,
        PermissionService permissionService
    ) {
        this.boardListRepository = boardListRepository;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
    }

    @GetMapping
    public ResponseEntity<List<BoardListDto>> getLists(
        @PathVariable UUID projectId,
        @AuthenticationPrincipal ScarPrincipal principal
    ) {
        requireProjectAccess(principal, projectId);
        List<BoardList> lists = boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(projectId);
        return ResponseEntity.ok(lists.stream().map(BoardListDto::from).toList());
    }

    @PostMapping
    public ResponseEntity<BoardListDto> createList(
        @PathVariable UUID projectId,
        @Valid @RequestBody CreateBoardListRequest req,
        @AuthenticationPrincipal ScarPrincipal principal
    ) {
        User user = loadUser(principal);
        permissionService.requireManageBoardLists(user);
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        permissionService.requireAccessProject(user, project);

        BoardList list = new BoardList();
        list.setProject(project);
        list.setName(req.name());
        list.setSortOrder(req.sortOrder());
        list.setArchived(false);

        BoardList saved = boardListRepository.save(list);
        return ResponseEntity.ok(BoardListDto.from(saved));
    }

    @PutMapping("/{listId}")
    public ResponseEntity<BoardListDto> updateList(
        @PathVariable UUID projectId,
        @PathVariable UUID listId,
        @Valid @RequestBody UpdateBoardListRequest req,
        @AuthenticationPrincipal ScarPrincipal principal
    ) {
        User user = loadUser(principal);
        permissionService.requireManageBoardLists(user);
        requireProjectAccess(principal, projectId);

        BoardList list = boardListRepository.findByIdAndProjectId(listId, projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));

        list.setName(req.name());
        list.setSortOrder(req.sortOrder());
        list.setArchived(req.archived());

        BoardList updated = boardListRepository.save(list);
        return ResponseEntity.ok(BoardListDto.from(updated));
    }

    @DeleteMapping("/{listId}")
    public ResponseEntity<Void> deleteList(
        @PathVariable UUID projectId,
        @PathVariable UUID listId,
        @AuthenticationPrincipal ScarPrincipal principal
    ) {
        User user = loadUser(principal);
        permissionService.requireManageBoardLists(user);
        requireProjectAccess(principal, projectId);

        BoardList list = boardListRepository.findByIdAndProjectId(listId, projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));

        list.setArchived(true);
        boardListRepository.save(list);

        return ResponseEntity.noContent().build();
    }

    private void requireProjectAccess(ScarPrincipal principal, UUID projectId) {
        User user = loadUser(principal);
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));
        permissionService.requireAccessProject(user, project);
    }

    private User loadUser(ScarPrincipal principal) {
        return userRepository.findByIdWithRoles(principal.userId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }
}

package com.scar.api.web;

import com.scar.api.domain.entity.BoardList;
import com.scar.api.domain.entity.Project;
import com.scar.api.dto.BoardListDto;
import com.scar.api.dto.CreateBoardListRequest;
import com.scar.api.dto.UpdateBoardListRequest;
import com.scar.api.repository.BoardListRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.security.ScarPrincipal;
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

    public BoardListController(
        BoardListRepository boardListRepository,
        ProjectRepository projectRepository
    ) {
        this.boardListRepository = boardListRepository;
        this.projectRepository = projectRepository;
    }

    @GetMapping
    public ResponseEntity<List<BoardListDto>> getLists(@PathVariable UUID projectId) {
        List<BoardList> lists = boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(projectId);
        return ResponseEntity.ok(lists.stream()
            .map(this::toDto)
            .toList());
    }

    @PostMapping
    public ResponseEntity<BoardListDto> createList(
        @PathVariable UUID projectId,
        @Valid @RequestBody CreateBoardListRequest req,
        @AuthenticationPrincipal ScarPrincipal principal
    ) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Proyecto no encontrado"));

        BoardList list = new BoardList();
        list.setProject(project);
        list.setName(req.name());
        list.setSortOrder(req.sortOrder());
        list.setArchived(false);
        
        BoardList saved = boardListRepository.save(list);
        return ResponseEntity.ok(toDto(saved));
    }

    @PutMapping("/{listId}")
    public ResponseEntity<BoardListDto> updateList(
        @PathVariable UUID projectId,
        @PathVariable UUID listId,
        @Valid @RequestBody UpdateBoardListRequest req
    ) {
        BoardList list = boardListRepository.findByIdAndProjectId(listId, projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));

        list.setName(req.name());
        list.setSortOrder(req.sortOrder());
        list.setArchived(req.archived());
        
        BoardList updated = boardListRepository.save(list);
        return ResponseEntity.ok(toDto(updated));
    }

    @DeleteMapping("/{listId}")
    public ResponseEntity<Void> deleteList(
        @PathVariable UUID projectId,
        @PathVariable UUID listId
    ) {
        BoardList list = boardListRepository.findByIdAndProjectId(listId, projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lista no encontrada"));

        list.setArchived(true);
        boardListRepository.save(list);
        
        return ResponseEntity.noContent().build();
    }

    private BoardListDto toDto(BoardList list) {
        return new BoardListDto(
            list.getId(),
            list.getProject().getId(),
            list.getName(),
            list.getSortOrder(),
            list.isArchived(),
            list.getCreatedAt(),
            list.getUpdatedAt()
        );
    }
}

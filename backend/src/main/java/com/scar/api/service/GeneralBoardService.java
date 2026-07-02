package com.scar.api.service;

import com.scar.api.domain.BoardListStandard;
import com.scar.api.domain.entity.BoardList;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.ProjectType;
import com.scar.api.repository.BoardListRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.repository.UserRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class GeneralBoardService {

    public static final String GENERAL_BOARD_KEY = "GEN";
    public static final String GENERAL_BOARD_NAME = "Tablero general";

    private final ProjectRepository projectRepository;
    private final BoardListRepository boardListRepository;
    private final UserRepository userRepository;

    public GeneralBoardService(
        ProjectRepository projectRepository,
        BoardListRepository boardListRepository,
        UserRepository userRepository
    ) {
        this.projectRepository = projectRepository;
        this.boardListRepository = boardListRepository;
        this.userRepository = userRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void onApplicationReady() {
        ensureGeneralBoardExists();
    }

    @Transactional
    public Project ensureGeneralBoardExists() {
        Optional<Project> existing = projectRepository.findByKeyCode(GENERAL_BOARD_KEY);
        if (existing.isPresent()) {
            Project project = existing.get();
            normalizeGeneralBoardMetadata(project);
            ensureGeneralLists(project);
            ensureAllActiveUsersAreMembers(project);
            return project;
        }

        Project project = new Project();
        project.setKeyCode(GENERAL_BOARD_KEY);
        project.setName(GENERAL_BOARD_NAME);
        project.setDescription("");
        project.setAccent("bg-primary-600");
        project.setType(ProjectType.GENERAL);

        List<User> activeUsers = userRepository.findByActiveTrue();
        project.getMembers().addAll(activeUsers);

        project = projectRepository.save(project);
        createGeneralLists(project);
        return project;
    }

    @Transactional(readOnly = true)
    public Optional<Project> findGeneralBoard() {
        return projectRepository.findByKeyCode(GENERAL_BOARD_KEY)
            .or(() -> projectRepository.findFirstByTypeOrderByCreatedAtAsc(ProjectType.GENERAL));
    }

    @Transactional(readOnly = true)
    public Optional<BoardList> findReceivedList(Project generalBoard) {
        return boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(generalBoard.getId())
            .stream()
            .filter(list -> list.getName().toLowerCase().contains("asign"))
            .findFirst()
            .or(() -> boardListRepository.findByProjectIdAndArchivedFalseOrderBySortOrderAsc(generalBoard.getId())
                .stream()
                .findFirst());
    }

    private void ensureGeneralLists(Project project) {
        List<BoardList> lists = boardListRepository.findByProjectIdOrderBySortOrderAsc(project.getId());
        if (lists.isEmpty()) {
            createGeneralLists(project);
        }
    }

    private void normalizeGeneralBoardMetadata(Project project) {
        boolean changed = false;
        if (!GENERAL_BOARD_NAME.equals(project.getName())) {
            project.setName(GENERAL_BOARD_NAME);
            changed = true;
        }
        if (project.getDescription() != null && !project.getDescription().isBlank()) {
            project.setDescription("");
            changed = true;
        }
        if (project.getType() != ProjectType.GENERAL) {
            project.setType(ProjectType.GENERAL);
            changed = true;
        }
        if (!"bg-primary-600".equals(project.getAccent())) {
            project.setAccent("bg-primary-600");
            changed = true;
        }
        if (changed) {
            projectRepository.save(project);
        }
    }

    private void createGeneralLists(Project project) {
        for (int i = 0; i < BoardListStandard.NAMES.size(); i++) {
            BoardList list = new BoardList();
            list.setProject(project);
            list.setName(BoardListStandard.NAMES.get(i));
            list.setSortOrder(i);
            list.setArchived(false);
            boardListRepository.save(list);
        }
    }

    private void ensureAllActiveUsersAreMembers(Project project) {
        boolean changed = false;
        for (User user : userRepository.findByActiveTrue()) {
            if (!project.getMembers().contains(user)) {
                project.getMembers().add(user);
                changed = true;
            }
        }
        if (changed) {
            projectRepository.save(project);
        }
    }
}

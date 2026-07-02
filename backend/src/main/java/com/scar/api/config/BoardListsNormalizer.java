package com.scar.api.config;

import com.scar.api.domain.BoardListStandard;
import com.scar.api.domain.entity.BoardList;
import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.enums.ProjectType;
import com.scar.api.repository.BoardListRepository;
import com.scar.api.repository.IssueRepository;
import com.scar.api.repository.ProjectRepository;
import com.scar.api.service.GeneralBoardService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class BoardListsNormalizer implements ApplicationRunner {

    private final ProjectRepository projectRepository;
    private final BoardListRepository boardListRepository;
    private final IssueRepository issueRepository;

    public BoardListsNormalizer(
        ProjectRepository projectRepository,
        BoardListRepository boardListRepository,
        IssueRepository issueRepository
    ) {
        this.projectRepository = projectRepository;
        this.boardListRepository = boardListRepository;
        this.issueRepository = issueRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (Project project : projectRepository.findAll()) {
            if (isGeneralBoard(project)) {
                ensureStandardLists(project);
            }
        }
    }

    private boolean isGeneralBoard(Project project) {
        return project.getType() == ProjectType.GENERAL
            || GeneralBoardService.GENERAL_BOARD_KEY.equalsIgnoreCase(project.getKeyCode());
    }

    private void ensureStandardLists(Project project) {
        List<BoardList> existing = new ArrayList<>(
            boardListRepository.findByProjectIdOrderBySortOrderAsc(project.getId())
        );
        if (matchesStandard(existing)) {
            return;
        }

        Map<Integer, BoardList> targetByOrder = new HashMap<>();
        for (int i = 0; i < BoardListStandard.NAMES.size(); i++) {
            String name = BoardListStandard.NAMES.get(i);
            BoardList list = existing.stream()
                .filter(candidate -> candidate.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElseGet(() -> existing.stream()
                    .filter(candidate -> !candidate.isArchived())
                    .filter(candidate -> targetByOrder.values().stream().noneMatch(v -> v.getId().equals(candidate.getId())))
                    .min(Comparator.comparingInt(BoardList::getSortOrder))
                    .orElse(null));

            if (list == null) {
                list = new BoardList();
                list.setProject(project);
                list.setArchived(false);
            }

            list.setName(name);
            list.setSortOrder(i);
            list.setArchived(false);
            list = boardListRepository.save(list);
            targetByOrder.put(i, list);
        }

        BoardList defaultList = targetByOrder.get(2);
        for (BoardList old : existing) {
            boolean kept = targetByOrder.values().stream().anyMatch(list -> list.getId().equals(old.getId()));
            if (kept) {
                continue;
            }
            List<Issue> issues = issueRepository.findByProjectId(project.getId()).stream()
                .filter(issue -> issue.getBoardList() != null && issue.getBoardList().getId().equals(old.getId()))
                .toList();
            for (Issue issue : issues) {
                issue.setBoardList(defaultList);
                issueRepository.save(issue);
            }
            old.setArchived(true);
            boardListRepository.save(old);
        }
    }

    private boolean matchesStandard(List<BoardList> lists) {
        List<BoardList> active = lists.stream()
            .filter(list -> !list.isArchived())
            .sorted(Comparator.comparingInt(BoardList::getSortOrder))
            .toList();
        if (active.size() != BoardListStandard.NAMES.size()) {
            return false;
        }
        for (int i = 0; i < BoardListStandard.NAMES.size(); i++) {
            if (!active.get(i).getName().equalsIgnoreCase(BoardListStandard.NAMES.get(i))) {
                return false;
            }
            if (active.get(i).getSortOrder() != i) {
                return false;
            }
        }
        return true;
    }
}

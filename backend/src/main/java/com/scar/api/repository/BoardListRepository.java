package com.scar.api.repository;

import com.scar.api.domain.entity.BoardList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BoardListRepository extends JpaRepository<BoardList, UUID> {

    List<BoardList> findByProjectIdAndArchivedFalseOrderBySortOrderAsc(UUID projectId);

    List<BoardList> findByProjectIdOrderBySortOrderAsc(UUID projectId);

    Optional<BoardList> findByIdAndProjectId(UUID id, UUID projectId);

    boolean existsByProjectIdAndName(UUID projectId, String name);
}

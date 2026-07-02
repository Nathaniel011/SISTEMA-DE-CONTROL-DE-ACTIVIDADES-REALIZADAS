package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.entity.Project;
import com.scar.api.domain.entity.User;
import com.scar.api.domain.enums.IssueColumn;
import com.scar.api.domain.enums.UserRole;
import com.scar.api.repository.ProjectRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class PermissionService {

    private final ProjectRepository projectRepository;

    public PermissionService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    public boolean isAdminOrChief(User user) {
        return hasRole(user, UserRole.ADMIN) || hasRole(user, UserRole.CHIEF);
    }

    public boolean isAdmin(User user) {
        return hasRole(user, UserRole.ADMIN);
    }

    public boolean isChief(User user) {
        return hasRole(user, UserRole.CHIEF);
    }

    public boolean isSecretary(User user) {
        return hasRole(user, UserRole.SECRETARY);
    }

    public boolean isStaff(User user) {
        return !isAdminOrChief(user) && !isSecretary(user);
    }

    public boolean canManageUsers(User user) {
        return isAdminOrChief(user);
    }

    public boolean canManageBoardMembers(User user) {
        return isAdminOrChief(user);
    }

    public boolean canCreateBoard(User user) {
        return isAdminOrChief(user);
    }

    public boolean canManageBoardLists(User user) {
        return isAdmin(user);
    }

    public boolean canAssignTasks(User user) {
        return isAdminOrChief(user) || isSecretary(user);
    }

    public boolean canAccessProject(User user, Project project) {
        if (isAdminOrChief(user)) {
            return true;
        }
        UUID userId = user.getId();
        return projectRepository.existsMember(project.getId(), userId);
    }

    public void requireAccessProject(User user, Project project) {
        if (!canAccessProject(user, project)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tiene acceso a este tablero");
        }
    }

    public void requireManageUsers(User user) {
        if (!canManageUsers(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo administrador o jefa pueden gestionar usuarios");
        }
    }

    public void requireManageBoardMembers(User user) {
        if (!canManageBoardMembers(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede gestionar miembros del tablero");
        }
    }

    public void requireCreateBoard(User user) {
        if (!canCreateBoard(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede crear tableros");
        }
    }

    public void requireManageBoardLists(User user) {
        if (!canManageBoardLists(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Las listas del tablero son fijas y no se pueden modificar");
        }
    }

    public void requireCreateIssue(User user, Project project) {
        requireAccessProject(user, project);
    }

    public void requireUpdateIssue(User user, Issue issue, String newAssigneeId) {
        if (isAdminOrChief(user) || isSecretary(user)) {
            return;
        }
        if (newAssigneeId != null && !newAssigneeId.isBlank()) {
            UUID requestedId = UUID.fromString(newAssigneeId);
            UUID currentId = issue.getAssignee() != null ? issue.getAssignee().getId() : null;
            if (!requestedId.equals(currentId) && !requestedId.equals(user.getId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo secretaría o jefatura pueden asignar tareas");
            }
        }
        if (issue.getCreatedBy() != null && issue.getCreatedBy().getId().equals(user.getId())) {
            return;
        }
        if (issue.getAssignee() != null && issue.getAssignee().getId().equals(user.getId())) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede editar esta tarea");
    }

    public void requireMoveIssue(User user, Issue issue, IssueColumn newColumn) {
        requireAccessProject(user, issue.getProject());
    }

    public void requireDeleteIssue(User user, Issue issue) {
        if (!canDeleteIssue(user, issue)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puede eliminar esta tarea");
        }
    }

    public boolean canDeleteIssue(User user, Issue issue) {
        if (!canAccessProject(user, issue.getProject())) {
            return false;
        }
        if (isAdminOrChief(user) || isSecretary(user)) {
            return true;
        }
        if (issue.getCreatedBy() != null && issue.getCreatedBy().getId().equals(user.getId())) {
            return true;
        }
        return false;
    }

    public void requireValidAssignee(User assigner, User assignee) {
        if (assignee == null) {
            return;
        }
        if (isSecretary(assigner) && !isStaff(assignee)) {
            throw new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "La secretaría solo puede asignar tareas al personal"
            );
        }
    }

    public void requireDeleteBoard(User user) {
        if (!canDeleteBoard(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo el administrador puede eliminar tableros");
        }
    }

    public boolean canDeleteBoard(User user) {
        return isAdmin(user);
    }

    private boolean hasRole(User user, UserRole role) {
        return user.getRoles().contains(role);
    }
}

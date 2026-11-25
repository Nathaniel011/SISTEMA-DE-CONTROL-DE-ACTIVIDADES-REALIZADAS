package com.scar.api.config;

import com.scar.api.domain.BoardListStandard;
import com.scar.api.domain.entity.*;
import com.scar.api.domain.enums.*;
import com.scar.api.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.util.Set;

@Configuration
public class DataInitializer {

    @Bean
    CommandLineRunner seed(
        UserRepository userRepository,
        ProjectRepository projectRepository,
        IssueRepository issueRepository,
        IssueDependencyRepository dependencyRepository,
        BoardListRepository boardListRepository,
        PasswordEncoder passwordEncoder,
        @Value("${scar.dev.seed-demo:false}") boolean seedDemo,
        @Value("${scar.bootstrap.admin-password:}") String initialPassword,
        @Value("${scar.bootstrap.admin-email:administrador@scar.local}") String initialEmail
    ) {
        return args -> {
            if (userRepository.count() > 0) return;

            if (!seedDemo) {
                if (initialPassword.isBlank()) return;
                if (initialPassword.length() < 12 || initialPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
                    throw new IllegalArgumentException("La contraseña inicial de SCAR debe tener al menos 12 caracteres y hasta 72 bytes");
                }
                userRepository.save(user("Administrador", "administrador", initialEmail, "AD", Set.of(UserRole.ADMIN),
                    passwordEncoder, initialPassword));
                return;
            }

            if (initialPassword.isBlank()) throw new IllegalStateException("Define SCAR_BOOTSTRAP_ADMIN_PASSWORD para crear los datos de demostración.");

            User admin = user("Administrador", "administrador", "admin@gmail.com", "AD", Set.of(UserRole.ADMIN), passwordEncoder, initialPassword);
            User chief = user("Sofía Vega", "svega", "sofia.vega@scar.local", "SV", Set.of(UserRole.CHIEF), passwordEncoder, initialPassword);
            User secretary = user("Ana Ríos", "arios", "ana.rios@scar.local", "AR", Set.of(UserRole.SECRETARY), passwordEncoder, initialPassword);
            User staff1 = user("Luis Mendoza", "lmendoza", "luis.mendoza@scar.local", "LM", Set.of(), passwordEncoder, initialPassword);
            User staff2 = user("Marco Aguilar", "maguilar", "marco.aguilar@scar.local", "MA", Set.of(), passwordEncoder, initialPassword);
            userRepository.saveAll(java.util.List.of(admin, chief, secretary, staff1, staff2));

            Project arg = project("ARG", "Plataforma SCAR", "Evolución del ecosistema operativo.", ProjectType.STANDARD, Set.of(admin, chief, staff1));
            Project spr = project("SPR", "Sprint actual", "Entregables de la iteración en curso.", ProjectType.STANDARD, Set.of(admin, secretary, staff1));
            Project general = project("GEN", "Tablero general", "", ProjectType.GENERAL, Set.of(admin, chief, secretary, staff1, staff2));
            general.setAccent("bg-primary-600");
            projectRepository.saveAll(java.util.List.of(arg, spr, general));

            BoardList argAssigned = boardList(arg, BoardListStandard.NAMES.get(0), 0);
            BoardList argProgress = boardList(arg, BoardListStandard.NAMES.get(1), 1);
            BoardList argPending = boardList(arg, BoardListStandard.NAMES.get(2), 2);
            BoardList argDone = boardList(arg, BoardListStandard.NAMES.get(3), 3);
            BoardList genAssigned = boardList(general, BoardListStandard.NAMES.get(0), 0);
            BoardList genProgress = boardList(general, BoardListStandard.NAMES.get(1), 1);
            BoardList genPending = boardList(general, BoardListStandard.NAMES.get(2), 2);
            BoardList genDone = boardList(general, BoardListStandard.NAMES.get(3), 3);
            boardListRepository.saveAll(java.util.List.of(
                argAssigned, argProgress, argPending, argDone,
                genAssigned, genProgress, genPending, genDone
            ));

            Issue i1 = issue(arg, 1, IssueColumn.in_progress, argProgress, "Diseñar módulo de trabajo Kanban",
                staff1, IssuePriority.high, LocalDate.now().plusDays(10), 210, secretary);
            Issue i2 = issue(arg, 2, IssueColumn.todo, argPending, "Integrar API REST Spring Boot",
                staff1, IssuePriority.medium, LocalDate.now().plusDays(15), 0, chief);
            Issue i3 = issue(arg, 3, IssueColumn.review, argProgress, "Revisar flujo de autenticación JWT",
                staff1, IssuePriority.medium, LocalDate.now().plusDays(8), 175, admin);
            Issue i4 = issue(arg, 4, IssueColumn.backlog, argPending, "Diagrama de Gantt con dependencias",
                chief, IssuePriority.low, null, 0, chief);
            Issue i5 = issue(arg, 5, IssueColumn.done, argDone, "Definir preset de colores teal",
                admin, IssuePriority.medium, LocalDate.now().minusDays(2), 130, admin);
            Issue i6 = issue(spr, 1, IssueColumn.in_progress, null, "Corregir validación formularios",
                staff1, IssuePriority.critical, LocalDate.now().plusDays(5), 95, secretary);
            issueRepository.saveAll(java.util.List.of(i1, i2, i3, i4, i5, i6));

            IssueDependency dep = new IssueDependency();
            dep.setIssue(i4);
            dep.setDependsOnIssue(i2);
            dep.setDependencyType(DependencyType.FINISH_TO_START);
            dependencyRepository.save(dep);
        };
    }

    private User user(String fullName, String username, String email, String initials, Set<UserRole> roles,
                      PasswordEncoder encoder, String rawPassword) {
        User u = new User();
        u.setFullName(fullName);
        u.setUsername(username);
        u.setEmail(email);
        u.setInitials(initials);
        u.setPasswordHash(encoder.encode(rawPassword));
        u.setRoles(roles);
        return u;
    }

    private Project project(String key, String name, String desc, ProjectType type, Set<User> members) {
        Project p = new Project();
        p.setKeyCode(key);
        p.setName(name);
        p.setDescription(desc);
        p.setType(type);
        p.getMembers().addAll(members);
        return p;
    }

    private BoardList boardList(Project project, String name, int sortOrder) {
        BoardList list = new BoardList();
        list.setProject(project);
        list.setName(name);
        list.setSortOrder(sortOrder);
        list.setArchived(false);
        return list;
    }

    private Issue issue(Project project, int num, IssueColumn column, BoardList boardList, String title,
                        User assignee, IssuePriority priority, LocalDate due, int tracked, User createdBy) {
        Issue i = new Issue();
        i.setProject(project);
        i.setIssueNumber(num);
        i.setColumnId(column);
        i.setBoardList(boardList);
        i.setTitle(title);
        i.setAssignee(assignee);
        i.setCreatedBy(createdBy);
        if (assignee != null) {
            i.setAssignedAt(java.time.Instant.now());
        }
        i.setPriority(priority);
        i.setDueDate(due);
        i.setTrackedMinutes(tracked);
        i.setSortOrder(0);
        return i;
    }
}

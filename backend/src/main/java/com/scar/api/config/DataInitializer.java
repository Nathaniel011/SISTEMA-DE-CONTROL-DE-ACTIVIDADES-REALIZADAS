package com.scar.api.config;

import com.scar.api.domain.entity.*;
import com.scar.api.domain.enums.*;
import com.scar.api.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.util.Set;

@Configuration
public class DataInitializer {

    @Bean
    CommandLineRunner seed(
        OrganizationRepository organizationRepository,
        UserRepository userRepository,
        ProjectRepository projectRepository,
        LabelRepository labelRepository,
        IssueRepository issueRepository,
        IssueDependencyRepository dependencyRepository,
        PasswordEncoder passwordEncoder
    ) {
        return args -> {
            if (organizationRepository.count() > 0) return;

            Organization org = new Organization();
            org.setName("SCAR Operaciones");
            org.setSlug("scar");
            org = organizationRepository.save(org);

            User admin = user("Pedro Condori", "pcondori", "pedro.condori@scar.local", "PC", Set.of(UserRole.ADMIN), org, passwordEncoder);
            User dev = user("Ana Ríos", "arios", "ana.rios@scar.local", "AR", Set.of(UserRole.MEMBER), org, passwordEncoder);
            User qa = user("Luis Mendoza", "lmendoza", "luis.mendoza@scar.local", "LM", Set.of(UserRole.MEMBER), org, passwordEncoder);
            User po = user("Sofía Vega", "svega", "sofia.vega@scar.local", "SV", Set.of(UserRole.SUPERVISOR), org, passwordEncoder);
            userRepository.saveAll(java.util.List.of(admin, dev, qa, po));

            Label l1 = label(org, "Frontend", "#14b8a6");
            Label l2 = label(org, "Backend", "#0d9488");
            Label l3 = label(org, "Bug", "#ef4444");
            Label l4 = label(org, "Mejora", "#8b5cf6");
            labelRepository.saveAll(java.util.List.of(l1, l2, l3, l4));

            Project arg = project(org, "ARG", "Plataforma SCAR", "Evolución del ecosistema operativo.", Set.of(admin, dev, po));
            Project spr = project(org, "SPR", "Sprint actual", "Entregables de la iteración en curso.", Set.of(admin, dev, qa));
            projectRepository.saveAll(java.util.List.of(arg, spr));

            Issue i1 = issue(arg, 1, IssueType.feature, IssueColumn.in_progress, "Diseñar módulo de trabajo Kanban",
                dev, IssuePriority.high, LocalDate.now().plusDays(10), Set.of(l1, l4), 210);
            Issue i2 = issue(arg, 2, IssueType.task, IssueColumn.todo, "Integrar API REST Spring Boot",
                dev, IssuePriority.medium, LocalDate.now().plusDays(15), Set.of(l2), 0);
            Issue i3 = issue(arg, 3, IssueType.bug, IssueColumn.review, "Revisar flujo de autenticación JWT",
                qa, IssuePriority.medium, LocalDate.now().plusDays(8), Set.of(l3), 175);
            Issue i4 = issue(arg, 4, IssueType.task, IssueColumn.backlog, "Diagrama de Gantt con dependencias",
                po, IssuePriority.low, null, Set.of(l1), 0);
            Issue i5 = issue(arg, 5, IssueType.chore, IssueColumn.done, "Definir preset de colores teal",
                admin, IssuePriority.medium, LocalDate.now().minusDays(2), Set.of(l1), 130);
            Issue i6 = issue(spr, 1, IssueType.bug, IssueColumn.in_progress, "Corregir validación formularios",
                qa, IssuePriority.critical, LocalDate.now().plusDays(5), Set.of(l3, l2), 95);
            issueRepository.saveAll(java.util.List.of(i1, i2, i3, i4, i5, i6));

            IssueDependency dep = new IssueDependency();
            dep.setIssue(i4);
            dep.setDependsOnIssue(i2);
            dep.setDependencyType(DependencyType.FINISH_TO_START);
            dependencyRepository.save(dep);
        };
    }

    private User user(String fullName, String username, String email, String initials, Set<UserRole> roles,
                      Organization org, PasswordEncoder encoder) {
        User u = new User();
        u.setOrganization(org);
        u.setFullName(fullName);
        u.setUsername(username);
        u.setEmail(email);
        u.setInitials(initials);
        u.setPasswordHash(encoder.encode("admin123"));
        u.setRoles(roles);
        return u;
    }

    private Label label(Organization org, String name, String color) {
        Label l = new Label();
        l.setOrganization(org);
        l.setName(name);
        l.setColor(color);
        return l;
    }

    private Project project(Organization org, String key, String name, String desc, Set<User> members) {
        Project p = new Project();
        p.setOrganization(org);
        p.setKeyCode(key);
        p.setName(name);
        p.setDescription(desc);
        p.getMembers().addAll(members);
        return p;
    }

    private Issue issue(Project project, int num, IssueType type, IssueColumn column, String title,
                        User assignee, IssuePriority priority, LocalDate due, Set<Label> labels, int tracked) {
        Issue i = new Issue();
        i.setProject(project);
        i.setIssueNumber(num);
        i.setType(type);
        i.setColumnId(column);
        i.setTitle(title);
        i.setAssignee(assignee);
        i.setPriority(priority);
        i.setDueDate(due);
        i.getLabels().addAll(labels);
        i.setTrackedMinutes(tracked);
        i.setSortOrder(0);
        return i;
    }
}

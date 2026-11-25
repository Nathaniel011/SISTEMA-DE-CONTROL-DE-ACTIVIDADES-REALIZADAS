package com.scar.api.service;

import com.scar.api.domain.enums.DependencyType;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.UUID;

final class GanttScheduler {
    private static final int MINUTES_PER_DAY = 480;
    static final int MAX_PLAN_DAYS = 3660;

    record Task(UUID id, UUID assignee, LocalDate start, LocalDate end, Integer estimate, int spent,
        boolean resolved, boolean pinned) {}
    record Edge(UUID source, UUID target, DependencyType type) {}
    record Window(LocalDate start, LocalDate end) {}
    record Options(LocalDate start, Integer capacity, Integer assigneeCapacity, boolean workdaysOnly) {}

    static Map<UUID, Window> schedule(List<Task> tasks, List<Edge> edges, Options options) {
        Map<UUID, Integer> order = new HashMap<>();
        Map<UUID, Task> byId = new HashMap<>();
        Map<UUID, Integer> pending = new HashMap<>();
        Map<UUID, List<Edge>> predecessors = new HashMap<>();
        Map<UUID, List<Edge>> successors = new HashMap<>();
        Capacity occupancy = new Capacity(options);
        Map<UUID, Window> windows = new LinkedHashMap<>();
        for (Task task : tasks) {
            order.put(task.id(), order.size());
            byId.put(task.id(), task);
            pending.put(task.id(), 0);
            if (task.pinned() && task.start() != null && task.end() != null) {
                Window window = new Window(task.start(), task.end());
                windows.put(task.id(), window);
                occupancy.reserve(window, task.assignee());
            }
        }
        for (Edge edge : edges) {
            if (!byId.containsKey(edge.source()) || !byId.containsKey(edge.target())) continue;
            predecessors.computeIfAbsent(edge.target(), ignored -> new ArrayList<>()).add(edge);
            successors.computeIfAbsent(edge.source(), ignored -> new ArrayList<>()).add(edge);
            pending.merge(edge.target(), 1, Integer::sum);
        }
        PriorityQueue<UUID> ready = new PriorityQueue<>(Comparator.comparingInt(order::get));
        for (Task task : tasks) if (pending.get(task.id()) == 0) ready.add(task.id());
        int visited = 0;
        while (!ready.isEmpty()) {
            UUID id = ready.remove();
            Task task = byId.get(id);
            if (!windows.containsKey(id)) {
                LocalDate earliest = options.start();
                for (Edge edge : predecessors.getOrDefault(id, List.of())) {
                    Window source = windows.get(edge.source());
                    LocalDate next = edge.type() == DependencyType.FINISH_TO_START ? source.end().plusDays(1) : source.start();
                    if (next.isAfter(earliest)) earliest = next;
                }
                Window window = occupancy.firstAvailable(earliest, duration(task, options.workdaysOnly()), task.assignee());
                occupancy.reserve(window, task.assignee());
                windows.put(id, window);
            }
            visited++;
            for (Edge edge : successors.getOrDefault(id, List.of())) {
                if (pending.merge(edge.target(), -1, Integer::sum) == 0) ready.add(edge.target());
            }
        }
        if (visited != tasks.size()) throw new IllegalArgumentException("El diagrama contiene dependencias circulares");
        return windows;
    }

    static LocalDate endDate(LocalDate start, int days, boolean workdaysOnly) {
        if (!workdaysOnly) return start.plusDays(days - 1L);
        LocalDate end = start;
        for (int day = 1; day < days; day++) end = nextWorkday(end.plusDays(1), workdaysOnly);
        return end;
    }

    static int estimatedDays(Integer estimate) {
        return estimate == null ? 1 : Math.max(1, (int) Math.ceil(estimate / (double) MINUTES_PER_DAY));
    }

    private static int duration(Task task, boolean workdaysOnly) {
        int estimate = task.estimate() == null ? 0 : task.estimate();
        int minutes = task.resolved() && task.spent() > 0 ? task.spent() : Math.max(estimate, task.spent());
        if (minutes > 0) return estimatedDays(minutes);
        if (task.start() == null || task.end() == null) return 1;
        if (ChronoUnit.DAYS.between(task.start(), task.end()) > MAX_PLAN_DAYS) {
            throw new IllegalArgumentException("El intervalo de una incidencia supera el horizonte del diagrama");
        }
        int days = 0;
        for (LocalDate day = task.start(); !day.isAfter(task.end()); day = day.plusDays(1)) {
            if (isWorkday(day, workdaysOnly)) days++;
        }
        return Math.max(1, days);
    }

    private static LocalDate nextWorkday(LocalDate day, boolean workdaysOnly) {
        while (!isWorkday(day, workdaysOnly)) day = day.plusDays(1);
        return day;
    }

    private static boolean isWorkday(LocalDate day, boolean workdaysOnly) {
        return !workdaysOnly || (day.getDayOfWeek() != DayOfWeek.SATURDAY && day.getDayOfWeek() != DayOfWeek.SUNDAY);
    }

    private record PersonDay(UUID assignee, LocalDate day) {}

    private static final class Capacity {
        private final Options options;
        private final Map<LocalDate, Integer> total = new HashMap<>();
        private final Map<PersonDay, Integer> byPerson = new HashMap<>();

        private Capacity(Options options) { this.options = options; }

        private Window firstAvailable(LocalDate earliest, int duration, UUID assignee) {
            if (duration > MAX_PLAN_DAYS) throw new IllegalArgumentException("La estimación supera el horizonte del diagrama");
            LocalDate start = nextWorkday(earliest, options.workdaysOnly());
            LocalDate limit = options.start().plusDays(MAX_PLAN_DAYS);
            while (!start.isAfter(limit)) {
                LocalDate end = endDate(start, duration, options.workdaysOnly());
                if (end.isAfter(limit)) break;
                LocalDate firstConflict = null;
                if (options.capacity() != null || (options.assigneeCapacity() != null && assignee != null)) {
                    for (LocalDate day = start; !day.isAfter(end); day = nextWorkday(day.plusDays(1), options.workdaysOnly())) {
                        if ((options.capacity() != null && total.getOrDefault(day, 0) >= options.capacity())
                            || (assignee != null && options.assigneeCapacity() != null
                                && byPerson.getOrDefault(new PersonDay(assignee, day), 0) >= options.assigneeCapacity())) {
                            firstConflict = day;
                            break;
                        }
                    }
                }
                if (firstConflict == null) return new Window(start, end);
                start = nextWorkday(firstConflict.plusDays(1), options.workdaysOnly());
            }
            throw new IllegalArgumentException("La capacidad y las fechas superan el horizonte del diagrama");
        }

        private void reserve(Window window, UUID assignee) {
            if (ChronoUnit.DAYS.between(window.start(), window.end()) > MAX_PLAN_DAYS) {
                throw new IllegalArgumentException("El intervalo de una incidencia supera el horizonte del diagrama");
            }
            if (options.capacity() == null && options.assigneeCapacity() == null) return;
            for (LocalDate day = nextWorkday(window.start(), options.workdaysOnly()); !day.isAfter(window.end());
                day = nextWorkday(day.plusDays(1), options.workdaysOnly())) {
                if (options.capacity() != null) total.merge(day, 1, Integer::sum);
                if (assignee != null && options.assigneeCapacity() != null) byPerson.merge(new PersonDay(assignee, day), 1, Integer::sum);
            }
        }
    }
}

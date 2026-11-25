package com.scar.api.service;

import com.scar.api.domain.enums.DependencyType;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GanttSchedulerTest {
    private static final LocalDate FRIDAY = LocalDate.of(2026, 11, 20);

    @Test
    void schedulesSuccessorOnNextWorkdayAndKeepsAOneDayTask() {
        var source = task(null, 480, 0, false);
        var target = task(null, 480, 0, false);
        var plan = GanttScheduler.schedule(List.of(target, source),
            List.of(new GanttScheduler.Edge(source.id(), target.id(), DependencyType.FINISH_TO_START)),
            new GanttScheduler.Options(FRIDAY, null, null, true));
        assertEquals(new GanttScheduler.Window(FRIDAY, FRIDAY), plan.get(source.id()));
        assertEquals(new GanttScheduler.Window(FRIDAY.plusDays(3), FRIDAY.plusDays(3)), plan.get(target.id()));
    }

    @Test
    void reservesFixedDatesAndHonorsOverallAndAssigneeCapacity() {
        UUID person = UUID.randomUUID();
        var fixed = new GanttScheduler.Task(UUID.randomUUID(), person, FRIDAY, FRIDAY.plusDays(1), 0, 0, false, true);
        var samePerson = task(person, 480, 0, false);
        var other = task(UUID.randomUUID(), 480, 0, false);
        var anonymous = task(null, 480, 0, false);
        var plan = GanttScheduler.schedule(List.of(samePerson, other, anonymous, fixed), List.of(),
            new GanttScheduler.Options(FRIDAY, 2, 1, false));
        assertEquals(FRIDAY.plusDays(1), plan.get(fixed.id()).end());
        assertEquals(FRIDAY.plusDays(2), plan.get(samePerson.id()).start());
        assertEquals(FRIDAY, plan.get(other.id()).start());
        assertEquals(FRIDAY.plusDays(1), plan.get(anonymous.id()).start());
    }

    @Test
    void usesSpentTimeWhenResolvedAndRetainsStartToStart() {
        var source = task(null, 1400, 480, true);
        var target = task(null, 480, 960, false);
        var plan = GanttScheduler.schedule(List.of(source, target),
            List.of(new GanttScheduler.Edge(source.id(), target.id(), DependencyType.START_TO_START)),
            new GanttScheduler.Options(FRIDAY, null, null, false));
        assertEquals(FRIDAY, plan.get(source.id()).end());
        assertEquals(FRIDAY, plan.get(target.id()).start());
        assertEquals(FRIDAY.plusDays(1), plan.get(target.id()).end());
    }

    @Test
    void rejectsCyclesBeforePublishingAnyDates() {
        var first = task(null, 480, 0, false);
        var second = task(null, 480, 0, false);
        assertThrows(IllegalArgumentException.class, () -> GanttScheduler.schedule(List.of(first, second),
            List.of(new GanttScheduler.Edge(first.id(), second.id(), DependencyType.FINISH_TO_START),
                new GanttScheduler.Edge(second.id(), first.id(), DependencyType.START_TO_START)),
            new GanttScheduler.Options(FRIDAY, null, null, false)));
    }

    private GanttScheduler.Task task(UUID person, int estimate, int spent, boolean resolved) {
        return new GanttScheduler.Task(UUID.randomUUID(), person, null, null, estimate, spent, resolved, false);
    }
}

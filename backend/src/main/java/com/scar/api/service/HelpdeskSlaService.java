package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.dto.HelpdeskDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@Service
public class HelpdeskSlaService {
    private final ZoneId zone;
    private final LocalTime opening;
    private final LocalTime closing;

    public HelpdeskSlaService(
        @Value("${scar.helpdesk.zone:America/La_Paz}") String zone,
        @Value("${scar.helpdesk.opening:09:00}") String opening,
        @Value("${scar.helpdesk.closing:17:00}") String closing
    ) {
        this.zone = ZoneId.of(zone);
        this.opening = LocalTime.parse(opening);
        this.closing = LocalTime.parse(closing);
        if (!this.closing.isAfter(this.opening)) throw new IllegalArgumentException("Horario de Helpdesk inválido");
    }

    public HelpdeskDto.Sla forIssue(Issue issue) {
        if (!issue.isHelpdeskRequest()) return null;
        int replyHours = switch (issue.getPriority()) {
            case critical -> 1;
            case high -> 2;
            case medium -> 4;
            case low -> 8;
        };
        return new HelpdeskDto.Sla(
            addHours(issue.getCreatedAt(), replyHours), issue.getFirstPublicReplyAt(),
            addHours(issue.getCreatedAt(), replyHours * 4), issue.getCompletedAt()
        );
    }

    Instant addHours(Instant start, int hours) {
        ZonedDateTime cursor = start.atZone(zone);
        Duration remaining = Duration.ofHours(hours);
        while (!remaining.isZero()) {
            ZonedDateTime dayStart = cursor.toLocalDate().atTime(opening).atZone(zone);
            ZonedDateTime dayEnd = cursor.toLocalDate().atTime(closing).atZone(zone);
            if (cursor.getDayOfWeek() != DayOfWeek.SATURDAY && cursor.getDayOfWeek() != DayOfWeek.SUNDAY
                && cursor.isBefore(dayEnd)) {
                if (cursor.isBefore(dayStart)) cursor = dayStart;
                Duration available = Duration.between(cursor, dayEnd);
                if (remaining.compareTo(available) <= 0) return cursor.plus(remaining).toInstant();
                remaining = remaining.minus(available);
            }
            cursor = cursor.toLocalDate().plusDays(1).atTime(opening).atZone(zone);
        }
        return cursor.toInstant();
    }
}

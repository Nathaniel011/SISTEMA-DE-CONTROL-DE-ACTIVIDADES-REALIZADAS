package com.scar.api.service;

import com.scar.api.domain.entity.Issue;
import com.scar.api.domain.enums.IssuePriority;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class HelpdeskSlaServiceTest {
    private final HelpdeskSlaService service = new HelpdeskSlaService("America/La_Paz", "09:00", "17:00");

    @Test
    void carriesRemainingBusinessTimeAcrossTheWeekend() {
        Instant fridayAtSixteenThirty = Instant.parse("2026-11-20T20:30:00Z");
        assertThat(service.addHours(fridayAtSixteenThirty, 1)).isEqualTo(Instant.parse("2026-11-23T13:30:00Z"));
    }

    @Test
    void beginsAfterOpeningWhenTheRequestArrivesOutsideBusinessHours() {
        Instant saturdayAtNoon = Instant.parse("2026-11-21T16:00:00Z");
        assertThat(service.addHours(saturdayAtNoon, 2)).isEqualTo(Instant.parse("2026-11-23T15:00:00Z"));
    }

    @Test
    void preservesTheRecordedFirstPublicReplyAndCompletionTimes() {
        Issue request = new Issue();
        request.setHelpdeskRequest(true);
        request.setPriority(IssuePriority.critical);
        Instant firstReply = Instant.parse("2026-11-20T15:00:00Z");
        Instant completion = Instant.parse("2026-11-20T16:00:00Z");
        request.setFirstPublicReplyAt(firstReply);
        request.setCompletedAt(completion);

        var sla = service.forIssue(request);
        assertThat(sla.firstReplyAt()).isEqualTo(firstReply);
        assertThat(sla.resolvedAt()).isEqualTo(completion);
        assertThat(sla.resolutionDueAt()).isAfter(sla.firstReplyDueAt());
        assertThat(service.forIssue(new Issue())).isNull();
    }
}

package com.scar.api.service.jobs;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.Mockito.*;

class WorkJobWorkerTest {
    @Test
    void executesClaimedWorkOncePerPoll() {
        var queue = mock(WorkJobQueue.class);
        var claim = new WorkJobQueue.Claim(UUID.randomUUID(), UUID.randomUUID(),
            WorkJobQueue.Kind.GANTT_PLAN, UUID.randomUUID(), 1);
        when(queue.claim()).thenReturn(Optional.of(claim));
        new WorkJobWorker(queue).runNext();
        verify(queue).execute(claim);
        verify(queue, never()).fail(any(), anyInt());
    }

    @Test
    void recordsRevokedPermissionsAsFailure() {
        var queue = mock(WorkJobQueue.class);
        var claim = new WorkJobQueue.Claim(UUID.randomUUID(), UUID.randomUUID(),
            WorkJobQueue.Kind.GANTT_PROJECT, UUID.randomUUID(), 2);
        when(queue.claim()).thenReturn(Optional.of(claim));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(queue).execute(claim);
        new WorkJobWorker(queue).runNext();
        verify(queue).fail(claim, 403);
    }
}

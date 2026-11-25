package com.scar.api.service.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(name = "scar.jobs.worker-enabled", havingValue = "true", matchIfMissing = true)
class WorkJobWorker {
    private static final Logger LOG = LoggerFactory.getLogger(WorkJobWorker.class);
    private final WorkJobQueue queue;

    WorkJobWorker(WorkJobQueue queue) { this.queue = queue; }

    @Scheduled(fixedDelayString = "${scar.jobs.poll-millis:1000}")
    void runNext() {
        queue.claim().ifPresent(claim -> {
            long start = System.nanoTime();
            try {
                queue.execute(claim);
            } catch (ResponseStatusException error) {
                queue.fail(claim, error.getStatusCode().value());
            } catch (RuntimeException error) {
                LOG.error("Work job failed kind={} id={}", claim.kind(), claim.id(), error);
                queue.fail(claim, 500);
            } finally {
                LOG.info("Work job finished kind={} id={} duration_ms={}", claim.kind(), claim.id(), (System.nanoTime() - start) / 1_000_000);
            }
        });
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 3600000)
    void cleanup() { queue.expireFinished(); }
}

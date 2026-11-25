package com.scar.api.web;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name = "scar.telemetry.rum-enabled", havingValue = "true", matchIfMissing = true)
public class WebVitalsController {
    private final MeterRegistry meters;

    public WebVitalsController(MeterRegistry meters) { this.meters = meters; }

    @PostMapping("/api/telemetry/vitals")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void record(@Valid @RequestBody Reading reading) {
        if ("CLS".equals(reading.metric()) && reading.value() > 100) return;
        DistributionSummary.builder("scar.browser.vitals")
            .baseUnit("CLS".equals(reading.metric()) ? "ratio" : "milliseconds")
            .tags("metric", reading.metric(), "surface", reading.surface(), "screen", reading.screen())
            .publishPercentileHistogram()
            .register(meters)
            .record(reading.value());
    }

    public record Reading(@NotNull @Pattern(regexp = "LCP|INP|CLS|FCP|TTFB") String metric,
        @NotNull @DecimalMin("0") @DecimalMax("120000") Double value,
        @NotNull @Pattern(regexp = "login|work|public|other") String surface,
        @NotNull @Pattern(regexp = "compact|wide") String screen) {}
}

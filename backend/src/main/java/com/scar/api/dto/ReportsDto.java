package com.scar.api.dto;

import java.util.List;

public record ReportsDto(
    SummaryDto summary,
    List<TimePerMemberDto> timePerMember
) {
    public record SummaryDto(
        int totalIssues,
        int completed,
        int criticalOpen,
        double totalHours
    ) {}
    
    public record TimePerMemberDto(
        String memberId,
        String memberName,
        double totalHours
    ) {}
}

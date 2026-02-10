package com.uimigration.platform.dto;

import com.uimigration.platform.model.TestRunStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestRunResultsResponse {
    private UUID runId;
    private UUID testCaseId;
    private String preMigrationUrl;
    private String postMigrationUrl;
    private TestRunStatus status;
    private Instant createdAt;
    private List<StepResultResponse> stepResults;
}


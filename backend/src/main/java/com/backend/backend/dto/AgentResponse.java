package com.backend.backend.dto;

import java.util.List;

import lombok.Data;

@Data
public class AgentResponse {

    private String status;
    private String testRunId;

    // Single run output
    private String executionOutput;
    private String executionError;

    // Migration comparison fields
    private Boolean preStatus;
    private Boolean postStatus;
    private Boolean regressionDetected;
    private String severity;
    private String explanation;
    private String difference;
    private String preOutput;
    private String postOutput;

    private String reportPath;
    private String preReportPath;
    private String postReportPath;
    private String preRawOutput;
    private String postRawOutput;

    private List<StepResultDTO> results;

    private Integer riskScore;
    private Long executionDurationMs;
}

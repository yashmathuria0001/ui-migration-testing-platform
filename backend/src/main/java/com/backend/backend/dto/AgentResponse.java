package com.backend.backend.dto;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class AgentResponse {

    private String status;
    private String testRunId;

    // Single run output
    private String executionOutput;
    private String executionError;
    @JsonProperty("error")
    private String error;

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
    private List<StepResultDTO> stepComparisons;

    private Integer riskScore;
    private Long executionDurationMs;
    private Map<String, Object> overallAnalysis;
}

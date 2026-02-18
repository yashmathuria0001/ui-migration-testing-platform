package com.backend.backend.dto;

import com.backend.backend.model.StepResult;
import lombok.Data;

import java.util.List;

@Data
public class CompleteExecutionRequest {

    private List<StepResult> results;
    private String reportPath;

    private Boolean preStatus;
    private Boolean postStatus;
    private Boolean regressionDetected;
    private String severity;
    private String explanation;
    private String preReportPath;
    private String postReportPath;
    private String preRawOutput;
    private String postRawOutput;
    private Integer riskScore;
    private Long executionDurationMs;
}

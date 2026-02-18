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
    private String difference;
    private String preOutput;
    private String postOutput;

    private String reportPath;
     private List<StepResultDTO> results;
}

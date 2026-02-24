package com.backend.backend.dto;

import lombok.Data;

@Data
public class StepResultDTO {

    private String stepName;
    private String preStatus;
    private String postStatus;
    private String comparisonStatus;
    private String comparisonLabel;
    private String difference;
    private String exactChange;
    private String detailedDifference;
    private String runtimeEvidence;
    private String detailedFix;
    private String preScreenshotPath;
    private String postScreenshotPath;
}

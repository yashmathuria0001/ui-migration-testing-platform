package com.backend.backend.model;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResult {

    private String stepName;

    private String preStatus;   // PASS / FAIL
    private String postStatus;  // PASS / FAIL
    private String comparisonStatus; // PASS / FAIL based on PRE vs POST comparison
    private String comparisonLabel; // Agent-provided user-facing label

    private String difference;  // AI comment if mismatch
    private String exactChange;
    private String detailedDifference;
    private String runtimeEvidence;
    private String detailedFix;

    private String preScreenshotPath;
    private String postScreenshotPath;
}

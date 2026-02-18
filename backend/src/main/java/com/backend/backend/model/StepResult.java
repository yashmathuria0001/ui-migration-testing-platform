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

    private String difference;  // AI comment if mismatch

    private String preScreenshotPath;
    private String postScreenshotPath;
}

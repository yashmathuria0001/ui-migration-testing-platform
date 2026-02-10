package com.uimigration.platform.dto;

import com.uimigration.platform.model.StepStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResultResponse {
    private UUID id;
    private int stepNumber;
    private StepStatus status;
    private String preScreenshotPath;
    private String postScreenshotPath;
    private String aiComment;
}


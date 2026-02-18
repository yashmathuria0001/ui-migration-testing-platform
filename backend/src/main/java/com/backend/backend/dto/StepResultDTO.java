package com.backend.backend.dto;

import lombok.Data;

@Data
public class StepResultDTO {

    private String stepName;
    private String preStatus;
    private String postStatus;
    private String difference;
    private String preScreenshotPath;
    private String postScreenshotPath;
}

package com.backend.backend.dto;

import com.backend.backend.model.StepResult;
import lombok.Data;

import java.util.List;

@Data
public class CompleteExecutionRequest {

    private List<StepResult> results;
    private String reportPath;
}

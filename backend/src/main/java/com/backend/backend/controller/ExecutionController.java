package com.backend.backend.controller;

import com.backend.backend.dto.AgentResponse;
import com.backend.backend.dto.CompleteExecutionRequest;
import com.backend.backend.model.StepResult;
import com.backend.backend.dto.FailExecutionRequest;
import com.backend.backend.model.TestRun;
import com.backend.backend.service.TestRunService;
import com.backend.backend.service.AgentClientService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/execution")
@RequiredArgsConstructor
public class ExecutionController {

    private final TestRunService testRunService;
    private final AgentClientService agentClientService; // ✅ ADD THIS

    @PutMapping("/{id}/start")
    public TestRun startExecution(@PathVariable String id) {
        return testRunService.markAsRunning(id);
    }

    @PutMapping("/{id}/complete")
    public TestRun completeExecution(
            @PathVariable String id,
            @RequestBody CompleteExecutionRequest request) {

        return testRunService.markAsCompleted(
                id,
                request.getResults(),
                request.getReportPath(),
                request.getPreStatus(),
                request.getPostStatus(),
                request.getRegressionDetected(),
                request.getSeverity(),
                request.getExplanation(),
                request.getPreReportPath(),
                request.getPostReportPath(),
                request.getPreRawOutput(),
                request.getPostRawOutput(),
                request.getRiskScore(),
                request.getExecutionDurationMs()
        );
    }

    @PutMapping("/{id}/fail")
    public TestRun failExecution(
            @PathVariable String id,
            @RequestBody FailExecutionRequest request) {

        return testRunService.markAsFailed(
                id,
                request.getErrorMessage()
        );
    }

    @GetMapping("/{id}")
    public TestRun getTestRun(@PathVariable String id) {
        return testRunService.getById(id);
    }

    @GetMapping("/ping")
    public String ping() {
        return "Execution Controller Working";
    }

    @PostMapping("/{id}/run")
    public TestRun runFullExecution(@PathVariable String id) {

        // 1️⃣ Mark RUNNING
        testRunService.markAsRunning(id);

        // 2️⃣ Get TestRun
        TestRun run = testRunService.getById(id);

        // 3️⃣ Call Agent
        AgentResponse response = agentClientService.executeAgent(run);

        // 4️⃣ Update DB based on result
        if ("SUCCESS".equals(response.getStatus())) {

            List<StepResult> stepResults = null;
            if (response.getResults() != null) {
                stepResults = response.getResults().stream()
                        .map(dto -> StepResult.builder()
                                .stepName(dto.getStepName())
                                .preStatus(dto.getPreStatus())
                                .postStatus(dto.getPostStatus())
                                .difference(dto.getDifference())
                                .preScreenshotPath(dto.getPreScreenshotPath())
                                .postScreenshotPath(dto.getPostScreenshotPath())
                                .build())
                        .collect(Collectors.toList());
            }

            return testRunService.markAsCompleted(
                    id,
                    stepResults,
                    response.getReportPath(),
                    response.getPreStatus(),
                    response.getPostStatus(),
                    response.getRegressionDetected(),
                    response.getSeverity(),
                    response.getExplanation(),
                    response.getPreReportPath(),
                    response.getPostReportPath(),
                    response.getPreRawOutput(),
                    response.getPostRawOutput(),
                    response.getRiskScore(),
                    response.getExecutionDurationMs()
            );

        } else {

            return testRunService.markAsFailed(
                    id,
                    response.getExecutionError()
            );
        }
    }
}

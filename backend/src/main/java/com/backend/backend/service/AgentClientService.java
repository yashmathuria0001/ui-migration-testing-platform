package com.backend.backend.service;

import com.backend.backend.dto.AgentRequest;
import com.backend.backend.dto.AgentResponse;
import com.backend.backend.dto.StepResultDTO;
import com.backend.backend.model.StepResult;
import com.backend.backend.model.TestRun;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AgentClientService {

    private final RestTemplate restTemplate;
    private final TestRunService testRunService;

    private static final String AGENT_BASE = "http://localhost:5000";
    private static final String AGENT_URL = AGENT_BASE + "/generate-script";
    private static final String AGENT_HEALTH_URL = AGENT_BASE + "/health";

    public AgentResponse executeAgent(TestRun run) {

        // Task 15: Ping agent health before execution
        try {
            ResponseEntity<String> healthRes = restTemplate.getForEntity(AGENT_HEALTH_URL, String.class);
            if (healthRes.getStatusCode().isError() || !(healthRes.getBody() != null && healthRes.getBody().contains("UP"))) {
                testRunService.markAsFailed(run.getId(), "Agent health check failed");
                return null;
            }
        } catch (Exception e) {
            testRunService.markAsFailed(run.getId(), "Agent unreachable: " + e.getMessage());
            throw new RuntimeException("Agent health check failed", e);
        }

        // 1️⃣ Mark as RUNNING
        testRunService.markAsRunning(run.getId());

        AgentRequest request = new AgentRequest(
                run.getId(),
                run.getPreMigrationUrl(),
                run.getPostMigrationUrl(),
                run.getSteps()
        );

        try {

            ResponseEntity<AgentResponse> response =
                    restTemplate.postForEntity(
                            AGENT_URL,
                            request,
                            AgentResponse.class
                    );

            AgentResponse agentResponse = response.getBody();

            // 🚨 If agent returned nothing
            if (agentResponse == null) {
                testRunService.markAsFailed(
                        run.getId(),
                        "Agent returned null response"
                );
                return null;
            }

            // Store results: when we have results (even with regression), use markAsCompleted to store all AI intelligence
            if (agentResponse.getResults() != null) {

                List<StepResult> stepResults = agentResponse.getResults()
                        .stream()
                        .map(this::mapToModel)
                        .collect(Collectors.toList());

                testRunService.markAsCompleted(
                        run.getId(),
                        stepResults,
                        agentResponse.getReportPath(),
                        agentResponse.getPreStatus(),
                        agentResponse.getPostStatus(),
                        agentResponse.getRegressionDetected(),
                        agentResponse.getSeverity(),
                        agentResponse.getExplanation(),
                        agentResponse.getPreReportPath(),
                        agentResponse.getPostReportPath(),
                        agentResponse.getPreRawOutput(),
                        agentResponse.getPostRawOutput(),
                        agentResponse.getRiskScore(),
                        agentResponse.getExecutionDurationMs()
                );

            } else {

                // Execution crashed (no results)
                testRunService.markAsFailed(
                        run.getId(),
                        agentResponse.getExecutionError() != null
                                ? agentResponse.getExecutionError()
                                : "Agent execution failed"
                );
            }

            return agentResponse;

        } catch (Exception e) {

            testRunService.markAsFailed(run.getId(), e.getMessage());

            throw new RuntimeException("Agent execution failed", e);
        }
    }

    // 🔥 DTO → Model Mapper
    private StepResult mapToModel(StepResultDTO dto) {

        return StepResult.builder()
                .stepName(dto.getStepName())
                .preStatus(dto.getPreStatus())
                .postStatus(dto.getPostStatus())
                .difference(dto.getDifference())
                .preScreenshotPath(dto.getPreScreenshotPath())
                .postScreenshotPath(dto.getPostScreenshotPath())
                .build();
    }
}

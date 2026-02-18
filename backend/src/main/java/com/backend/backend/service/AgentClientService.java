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

    private static final String AGENT_URL = "http://localhost:5000/generate-script";

    public AgentResponse executeAgent(TestRun run) {

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

            // ✅ SUCCESS
            if ("SUCCESS".equals(agentResponse.getStatus())) {

                // 🔥 Convert DTO → Model
                List<StepResult> stepResults = null;

                if (agentResponse.getResults() != null) {
                    stepResults = agentResponse.getResults()
                            .stream()
                            .map(this::mapToModel)
                            .collect(Collectors.toList());
                }

                testRunService.markAsCompleted(
                        run.getId(),
                        stepResults,
                        null   // report path can be added later
                );

            } else {

                // ❌ FAILED
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

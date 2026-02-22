package com.backend.backend.service;

import com.backend.backend.dto.AgentRequest;
import com.backend.backend.dto.AgentResponse;
import com.backend.backend.model.TestRun;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
@RequiredArgsConstructor
public class AgentClientService {

    private final RestTemplate restTemplate;
    @Value("${agent.base-url:http://127.0.0.1:5000}")
    private String agentBaseUrl;

    public AgentResponse executeAgent(TestRun run) {
        String healthUrl = agentBaseUrl + "/health";
        String agentUrl = agentBaseUrl + "/generate-script";

        // Task 15: Ping agent health before execution
        try {
            ResponseEntity<String> healthRes = restTemplate.getForEntity(healthUrl, String.class);
            if (healthRes.getStatusCode().isError() || !(healthRes.getBody() != null && healthRes.getBody().contains("UP"))) {
                throw new RuntimeException("Agent health check failed");
            }
        } catch (Exception e) {
            throw new RuntimeException("Agent unreachable: " + e.getMessage(), e);
        }

        AgentRequest request = new AgentRequest(
                run.getId(),
                run.getPreMigrationUrl(),
                run.getPostMigrationUrl(),
                run.getSteps()
        );

        ResponseEntity<AgentResponse> response =
                restTemplate.postForEntity(
                        agentUrl,
                        request,
                        AgentResponse.class
                );

        AgentResponse agentResponse = response.getBody();

        // 🚨 If agent returned nothing
        if (agentResponse == null) {
            throw new RuntimeException("Agent returned null response");
        }

        return agentResponse;
    }
}

package com.backend.backend.service;

import com.backend.backend.dto.AgentCredentialsResponse;
import com.backend.backend.model.TestRun;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AgentCredentialsService {

    private final TestRunService testRunService;

    public AgentCredentialsResponse getCredentials(String testRunId) {
        TestRun run = testRunService.getById(testRunId);
        return new AgentCredentialsResponse(
                run.getAppId() != null ? run.getAppId().trim() : "",
                run.getAppCredentials() != null ? run.getAppCredentials().trim() : ""
        );
    }
}

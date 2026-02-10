package com.uimigration.platform.controller;

import com.uimigration.platform.dto.TestRunRequest;
import com.uimigration.platform.dto.TestRunResponse;
import com.uimigration.platform.dto.TestRunResultsResponse;
import com.uimigration.platform.service.AgentOrchestrationService;
import com.uimigration.platform.service.TestRunService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/testruns")
@RequiredArgsConstructor
public class TestRunController {

    private final TestRunService testRunService;
    private final AgentOrchestrationService agentOrchestrationService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TestRunResponse create(@Valid @RequestBody TestRunRequest request) {
        TestRunResponse run = testRunService.createTestRun(request);
        agentOrchestrationService.triggerAgentAsync(run.getRunId());
        return run;
    }

    @GetMapping("/{id}/results")
    public TestRunResultsResponse results(@PathVariable UUID id) {
        return testRunService.getResults(id);
    }
}


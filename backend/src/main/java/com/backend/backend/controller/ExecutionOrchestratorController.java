package com.backend.backend.controller;

import com.backend.backend.dto.AgentResponse;
import com.backend.backend.model.TestRun;
import com.backend.backend.service.AgentClientService;
import com.backend.backend.service.TestRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/execute")
@RequiredArgsConstructor
public class ExecutionOrchestratorController {

    private final TestRunService testRunService;
    private final AgentClientService agentClientService;

    @PostMapping("/{id}")
    public AgentResponse execute(@PathVariable String id) {

        // 1️⃣ Get test run
        TestRun run = testRunService.getById(id);

        // 2️⃣ Mark as RUNNING
        testRunService.markAsRunning(id);

        // 3️⃣ Call Python Agent
        AgentResponse response = agentClientService.executeAgent(run);

        // 4️⃣ (For now) return agent response directly
        return response;
    }
}

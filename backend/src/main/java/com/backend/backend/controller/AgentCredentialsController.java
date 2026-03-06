package com.backend.backend.controller;

import com.backend.backend.dto.AgentCredentialsResponse;
import com.backend.backend.service.AgentCredentialsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentCredentialsController {

    private final AgentCredentialsService credentialsService;

    @GetMapping("/credentials/{id}")
    public AgentCredentialsResponse getCredentials(@PathVariable("id") String testRunId) {
        return credentialsService.getCredentials(testRunId);
    }
}

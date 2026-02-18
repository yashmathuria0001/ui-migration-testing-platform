package com.backend.backend.controller;

import com.backend.backend.model.TestRun;
import com.backend.backend.service.TestRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/test-runs")
@RequiredArgsConstructor
@CrossOrigin
public class TestRunController {

    private final TestRunService service;

    @PostMapping("/create")
    public TestRun create(@RequestBody TestRun request) {
        return service.createTestRun(request);
    }
}

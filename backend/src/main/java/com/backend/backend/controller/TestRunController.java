package com.backend.backend.controller;

import com.backend.backend.model.TestRun;
import com.backend.backend.service.TestRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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

    @GetMapping
    public Page<TestRun> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return service.findAllPaginated(pageable);
    }

    @GetMapping("/stats")
    public java.util.Map<String, Long> stats() {
        return service.getStats();
    }
}

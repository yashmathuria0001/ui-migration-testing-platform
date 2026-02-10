package com.uimigration.platform.controller;

import com.uimigration.platform.dto.TestCaseRequest;
import com.uimigration.platform.dto.TestCaseResponse;
import com.uimigration.platform.service.TestCaseService;
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
@RequestMapping("/api/testcases")
@RequiredArgsConstructor
public class TestCaseController {

    private final TestCaseService testCaseService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TestCaseResponse create(@Valid @RequestBody TestCaseRequest request) {
        return testCaseService.createTestCase(request);
    }

    @GetMapping("/{id}")
    public TestCaseResponse get(@PathVariable UUID id) {
        return testCaseService.getTestCase(id);
    }
}


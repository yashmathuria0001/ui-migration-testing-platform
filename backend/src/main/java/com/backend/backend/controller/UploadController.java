package com.backend.backend.controller;

import com.backend.backend.dto.CreateTestRunRequest;
import com.backend.backend.dto.GitHubImportRequest;
import com.backend.backend.model.TestRun;
import com.backend.backend.service.ExcelParserService;
import com.backend.backend.service.GitHubTestCaseService;
import com.backend.backend.service.TestRunService;
import com.backend.backend.util.StepSanitizer;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/testruns")
@RequiredArgsConstructor
public class UploadController {

    private final ExcelParserService excelParserService;
    private final TestRunService testRunService;
    private final GitHubTestCaseService gitHubTestCaseService;

    @PostMapping("/upload")
    public TestRun uploadExcel(
            @RequestParam("file") MultipartFile file,
            @RequestParam("appId") String appId,
            @RequestParam("appCredentials") String appCredentials,
            @RequestParam("preMigrationUrl") String preMigrationUrl,
            @RequestParam("postMigrationUrl") String postMigrationUrl) {
        return excelParserService.parseAndCreateTestRun(file, appId, appCredentials, preMigrationUrl, postMigrationUrl);
    }

    @PostMapping("/create")
    public TestRun createFromJson(@RequestBody CreateTestRunRequest request) {
        TestRun run = new TestRun();
        run.setAppId(request.getAppId());
        run.setAppCredentials(request.getAppCredentials());
        run.setPreMigrationUrl(request.getPreMigrationUrl());
        run.setPostMigrationUrl(request.getPostMigrationUrl());
        run.setSteps(request.getSteps() == null
                ? List.of()
                : request.getSteps().stream()
                .map(StepSanitizer::sanitize)
                .filter(step -> !step.isBlank())
                .collect(Collectors.toList()));
        return testRunService.createTestRun(run);
    }

    @PostMapping("/github")
    public TestRun createFromGithub(@RequestBody GitHubImportRequest request) {
        return gitHubTestCaseService.createFromGithub(request);
    }
}

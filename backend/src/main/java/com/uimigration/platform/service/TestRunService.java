package com.uimigration.platform.service;

import com.uimigration.platform.dto.StepResultResponse;
import com.uimigration.platform.dto.TestRunRequest;
import com.uimigration.platform.dto.TestRunResponse;
import com.uimigration.platform.dto.TestRunResultsResponse;
import com.uimigration.platform.model.StepResult;
import com.uimigration.platform.model.StepStatus;
import com.uimigration.platform.model.TestRun;
import com.uimigration.platform.model.TestRunStatus;
import com.uimigration.platform.repository.StepResultRepository;
import com.uimigration.platform.repository.TestCaseRepository;
import com.uimigration.platform.repository.TestRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class TestRunService {

    private final TestRunRepository testRunRepository;
    private final StepResultRepository stepResultRepository;
    private final TestCaseRepository testCaseRepository;

    @Transactional
    public TestRunResponse createTestRun(TestRunRequest request) {
        if (!testCaseRepository.existsById(request.getTestCaseId())) {
            throw new ResponseStatusException(NOT_FOUND, "TestCase not found: " + request.getTestCaseId());
        }

        TestRun run = TestRun.builder()
                .testCaseId(request.getTestCaseId())
                .preMigrationUrl(request.getPreMigrationUrl())
                .postMigrationUrl(request.getPostMigrationUrl())
                .status(TestRunStatus.CREATED)
                .createdAt(Instant.now())
                .build();

        TestRun saved = testRunRepository.save(run);
        return TestRunResponse.builder().runId(saved.getId()).status(saved.getStatus()).build();
    }

    @Transactional
    public void updateStatus(UUID runId, TestRunStatus status) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "TestRun not found: " + runId));
        run.setStatus(status);
        testRunRepository.save(run);
    }

    @Transactional
    public void persistAgentReport(UUID runId, AgentOrchestrationService.AgentReport report) {
        // idempotency: replace all step results for this run
        List<StepResult> existing = stepResultRepository.findByTestRunIdOrderByStepNumberAsc(runId);
        stepResultRepository.deleteAllInBatch(existing);

        if (report.getSteps() == null) {
            return;
        }

        List<StepResult> toSave = report.getSteps().stream()
                .map(s -> StepResult.builder()
                        .testRunId(runId)
                        .stepNumber(s.getStepNumber())
                        .status(parseStepStatus(s.getStatus()))
                        .preScreenshotPath(nullToEmpty(s.getPreScreenshotPath()))
                        .postScreenshotPath(nullToEmpty(s.getPostScreenshotPath()))
                        .aiComment(nullToEmpty(s.getAiComment()))
                        .build())
                .toList();

        stepResultRepository.saveAll(toSave);
    }

    @Transactional(readOnly = true)
    public TestRunResultsResponse getResults(UUID runId) {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "TestRun not found: " + runId));
        List<StepResult> results = stepResultRepository.findByTestRunIdOrderByStepNumberAsc(runId);

        List<StepResultResponse> stepDtos = results.stream()
                .map(r -> StepResultResponse.builder()
                        .id(r.getId())
                        .stepNumber(r.getStepNumber())
                        .status(r.getStatus())
                        .preScreenshotPath(r.getPreScreenshotPath())
                        .postScreenshotPath(r.getPostScreenshotPath())
                        .aiComment(r.getAiComment())
                        .build())
                .toList();

        return TestRunResultsResponse.builder()
                .runId(run.getId())
                .testCaseId(run.getTestCaseId())
                .preMigrationUrl(run.getPreMigrationUrl())
                .postMigrationUrl(run.getPostMigrationUrl())
                .status(run.getStatus())
                .createdAt(run.getCreatedAt())
                .stepResults(stepDtos)
                .build();
    }

    private static StepStatus parseStepStatus(String raw) {
        if (raw == null) return StepStatus.FAIL;
        return switch (raw.trim().toUpperCase(Locale.ROOT)) {
            case "PASS" -> StepStatus.PASS;
            case "FAIL" -> StepStatus.FAIL;
            default -> StepStatus.FAIL;
        };
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}


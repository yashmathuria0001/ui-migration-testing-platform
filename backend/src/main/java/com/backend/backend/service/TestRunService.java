package com.backend.backend.service;

import com.backend.backend.model.TestRun;
import com.backend.backend.model.StepResult;
import com.backend.backend.repository.TestRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TestRunService {

    private final TestRunRepository repository;

    public Page<TestRun> findAllPaginated(Pageable pageable) {
        return repository.findAllByOrderByCreatedAtDesc(pageable);
    }

    public java.util.Map<String, Long> getStats() {
        java.util.List<TestRun> all = repository.findAll();
        long total = all.size();
        long passed = all.stream().filter(r -> "COMPLETED".equals(r.getStatus()) && Boolean.FALSE.equals(r.getRegressionDetected())).count();
        long failed = all.stream().filter(r -> "FAILED".equals(r.getStatus())).count();
        long regressions = all.stream().filter(r -> Boolean.TRUE.equals(r.getRegressionDetected())).count();
        long highSeverity = all.stream().filter(r -> "HIGH".equals(r.getSeverity())).count();
        return java.util.Map.of(
                "totalRuns", total,
                "passed", passed,
                "failed", failed,
                "regressions", regressions,
                "highSeverity", highSeverity
        );
    }

    public TestRun createTestRun(TestRun request) {

        request.setStatus("CREATED");
        request.setCreatedAt(LocalDateTime.now());

        return repository.save(request);
    }

    public TestRun markAsRunning(String id) {

        TestRun run = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TestRun not found"));

        run.setStatus("RUNNING");
        run.setExecutionStartTime(LocalDateTime.now());

        return repository.save(run);
    }

    public TestRun markAsCompleted(
            String id,
            List<StepResult> results,
            String reportPath,
            Boolean preStatus,
            Boolean postStatus,
            Boolean regressionDetected,
            String severity,
            String explanation,
            String preReportPath,
            String postReportPath,
            String preRawOutput,
            String postRawOutput,
            Integer riskScore,
            Long executionDurationMs) {

        TestRun run = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TestRun not found"));

        run.setStatus("COMPLETED");
        run.setExecutionEndTime(LocalDateTime.now());
        if (results != null) {
            run.setResults(results);
        }
        if (reportPath != null && !reportPath.isBlank()) {
            run.setCombinedReportPath(reportPath);
        }
        run.setPreStatus(preStatus);
        run.setPostStatus(postStatus);
        run.setRegressionDetected(regressionDetected);
        run.setSeverity(severity);
        run.setAiExplanation(explanation);
        run.setPreReportPath(preReportPath);
        run.setPostReportPath(postReportPath);
        run.setPreRawOutput(preRawOutput);
        run.setPostRawOutput(postRawOutput);
        run.setRiskScore(riskScore);
        run.setExecutionDurationMs(executionDurationMs);

        return repository.save(run);
    }

    public TestRun markAsFailed(String id, String error) {

        TestRun run = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TestRun not found"));

        run.setStatus("FAILED");
        run.setExecutionEndTime(LocalDateTime.now());
        run.setErrorMessage(error);

        return repository.save(run);
    }
    public TestRun getById(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TestRun not found"));
    }

}

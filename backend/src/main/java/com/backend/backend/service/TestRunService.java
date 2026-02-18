package com.backend.backend.service;

import com.backend.backend.model.TestRun;
import com.backend.backend.model.StepResult;
import com.backend.backend.repository.TestRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TestRunService {

    private final TestRunRepository repository;

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

    public TestRun markAsCompleted(String id, List<StepResult> results, String reportPath) {

        TestRun run = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("TestRun not found"));

        run.setStatus("COMPLETED");
        run.setExecutionEndTime(LocalDateTime.now());
        run.setResults(results);
        run.setCombinedReportPath(reportPath);

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

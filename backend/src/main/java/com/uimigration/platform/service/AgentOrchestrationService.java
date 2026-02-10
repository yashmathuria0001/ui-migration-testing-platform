package com.uimigration.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.uimigration.platform.model.TestRun;
import com.uimigration.platform.model.TestRunStatus;
import com.uimigration.platform.model.TestStep;
import com.uimigration.platform.repository.TestStepRepository;
import com.uimigration.platform.repository.TestRunRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class AgentOrchestrationService {

    private final ObjectMapper objectMapper;
    private final TestRunRepository testRunRepository;
    private final TestStepRepository testStepRepository;
    private final TestRunService testRunService;

    @Value("${platform.agent.nodeCommand:node}")
    private String nodeCommand;

    @Value("${platform.agent.entrypoint:agent/src/index.js}")
    private String agentEntrypoint;

    @Value("${platform.agent.workingDir:..}")
    private String agentWorkingDir;

    @Value("${platform.storage.basePath:storage}")
    private String storageBasePath;

    @Value("${platform.agent.processTimeoutSeconds:900}")
    private long processTimeoutSeconds;

    @Async
    public void triggerAgentAsync(UUID runId) {
        try {
            runAgentBlocking(runId);
        } catch (Exception e) {
            log.error("Agent orchestration failed for runId={}", runId, e);
            testRunService.updateStatus(runId, TestRunStatus.FAILED);
        }
    }

    private void runAgentBlocking(UUID runId) throws Exception {
        TestRun run = testRunRepository.findById(runId)
                .orElseThrow(() -> new IllegalStateException("TestRun not found: " + runId));

        testRunService.updateStatus(runId, TestRunStatus.RUNNING);

        writeInputJson(run);

        ProcessBuilder pb = new ProcessBuilder(
                nodeCommand,
                agentEntrypoint,
                "--runId=" + runId,
                "--preMigrationUrl=" + run.getPreMigrationUrl(),
                "--postMigrationUrl=" + run.getPostMigrationUrl()
        );

        pb.directory(Path.of(agentWorkingDir).toFile());
        pb.redirectErrorStream(true);
        // Make browser downloads deterministic and project-local
        pb.environment().putIfAbsent("PLAYWRIGHT_BROWSERS_PATH", "0");

        Path agentLogPath = Path.of(storageBasePath, runId.toString(), "agent.log");
        Files.createDirectories(agentLogPath.getParent());
        pb.redirectOutput(agentLogPath.toFile());

        log.info("Starting agent for runId={} in dir={}", runId, pb.directory());
        Process process = pb.start();

        boolean finished = process.waitFor(processTimeoutSeconds, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("Agent timed out after " + processTimeoutSeconds + "s");
        }

        int exit = process.exitValue();
        if (exit != 0) {
            throw new IllegalStateException("Agent exited with code " + exit + ". See " + agentLogPath.toAbsolutePath());
        }

        Path reportPath = Path.of(storageBasePath, runId.toString(), "report.json");
        if (!Files.exists(reportPath)) {
            throw new IllegalStateException("Agent report.json not found at " + reportPath.toAbsolutePath());
        }

        AgentReport report;
        try {
            report = objectMapper.readValue(Files.readString(reportPath), AgentReport.class);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse report.json at " + reportPath.toAbsolutePath(), e);
        }

        testRunService.persistAgentReport(runId, report);
        testRunService.updateStatus(runId, TestRunStatus.COMPLETED);
    }

    private void writeInputJson(TestRun run) throws IOException {
        List<TestStep> steps = testStepRepository.findByTestCaseIdOrderByStepNumberAsc(run.getTestCaseId());
        List<String> instructions = steps.stream()
                .sorted(Comparator.comparingInt(TestStep::getStepNumber))
                .map(TestStep::getInstruction)
                .toList();

        AgentInput input = new AgentInput();
        input.setRunId(run.getId().toString());
        input.setPreMigrationUrl(run.getPreMigrationUrl());
        input.setPostMigrationUrl(run.getPostMigrationUrl());
        input.setSteps(instructions);

        Path inputPath = Path.of(storageBasePath, run.getId().toString(), "input.json");
        Files.createDirectories(inputPath.getParent());
        Files.writeString(inputPath, objectMapper.writeValueAsString(input));
    }

    @Data
    public static class AgentInput {
        private String runId;
        private String preMigrationUrl;
        private String postMigrationUrl;
        private List<String> steps;
    }

    @Data
    public static class AgentReport {
        private String runId;
        private List<AgentStepResult> steps;
        private Summary summary;
    }

    @Data
    public static class AgentStepResult {
        private int stepNumber;
        private String status; // PASS/FAIL
        private String preScreenshotPath;
        private String postScreenshotPath;
        private String aiComment;
        private Integer preNetworkCount;
        private Integer postNetworkCount;
        private Optional<String> failureReason;
    }

    @Data
    public static class Summary {
        private Integer totalSteps;
        private Integer failedSteps;
        private Long durationMs;
    }
}


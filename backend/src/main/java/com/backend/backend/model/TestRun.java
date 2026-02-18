package com.backend.backend.model;

import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Document(collection = "test_runs")
public class TestRun {

    @Id
    private String id;

    private String preMigrationUrl;
    private String postMigrationUrl;

    private String status; // CREATED, RUNNING, COMPLETED, FAILED

    private LocalDateTime createdAt;

    private LocalDateTime executionStartTime;
    private LocalDateTime executionEndTime;

    private String errorMessage;

    private String combinedReportPath;

    private List<String> steps;

    // 🔥 Embedded Mongo document
    private List<StepResult> results;
}

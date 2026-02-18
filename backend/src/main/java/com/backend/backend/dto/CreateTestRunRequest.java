package com.backend.backend.dto;

import lombok.Data;

import java.util.List;

@Data
public class CreateTestRunRequest {
    private String preMigrationUrl;
    private String postMigrationUrl;
    private List<String> steps;
}


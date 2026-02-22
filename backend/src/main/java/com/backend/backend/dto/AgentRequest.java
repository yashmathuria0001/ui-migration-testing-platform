package com.backend.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.List;

@Data
@AllArgsConstructor
public class AgentRequest {

    private String testRunId;
    private String preMigrationUrl;
    private String postMigrationUrl;
    private List<String> steps;
}

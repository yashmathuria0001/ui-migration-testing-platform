package com.backend.backend.dto;

import lombok.Data;
import java.util.List;

@Data
public class GitHubImportRequest {
    private String repository;      // owner/repo
    private String filePath;        // path/to/input.json
    private String branch;          // optional, defaults to main
    private String githubFileUrl;   // optional alternative to repository + filePath
    private String githubToken;     // optional for private repos
    private String preMigrationUrl; // optional override
    private String postMigrationUrl; // optional override
    private List<String> steps;     // optional override/fallback when JSON file has no steps[]
}

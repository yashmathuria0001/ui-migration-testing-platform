package com.backend.backend.service;

import com.backend.backend.dto.GitHubImportRequest;
import com.backend.backend.model.TestRun;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.json.JsonParser;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class GitHubTestCaseService {

    private final TestRunService testRunService;
    private final JsonParser jsonParser = JsonParserFactory.getJsonParser();
    private final Yaml yamlParser = new Yaml();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    public TestRun createFromGithub(GitHubImportRequest request) {
        String rawUrl = resolveRawUrl(request);
        String sourcePath = resolveSourcePath(request, rawUrl);
        String body = fetchFile(rawUrl, request.getGithubToken());
        String format = inferFormat(sourcePath, body);
        ImportPayload payload = parsePayload(format, body);

        List<String> steps = new ArrayList<>(payload.steps());
        if (steps.isEmpty() && request.getSteps() != null) {
            for (String step : request.getSteps()) {
                if (step != null && !step.trim().isEmpty()) {
                    steps.add(step.trim());
                }
            }
        }
        if (steps.isEmpty()) {
            throw new RuntimeException("No valid steps found. Provide steps[] in GitHub file or request body.");
        }

        String preUrl = firstNonBlank(request.getPreMigrationUrl(), payload.preMigrationUrl());
        String postUrl = firstNonBlank(request.getPostMigrationUrl(), payload.postMigrationUrl());
        if (isBlank(preUrl) || isBlank(postUrl)) {
            throw new RuntimeException("preMigrationUrl and postMigrationUrl are required (either in request or testcase file)");
        }

        TestRun run = new TestRun();
        run.setPreMigrationUrl(preUrl);
        run.setPostMigrationUrl(postUrl);
        run.setSteps(steps);
        return testRunService.createTestRun(run);
    }

    private String resolveRawUrl(GitHubImportRequest request) {
        if (!isBlank(request.getGithubFileUrl())) {
            String source = request.getGithubFileUrl().trim();
            if (source.contains("raw.githubusercontent.com")) return source;
            if (source.startsWith("https://github.com/") && source.contains("/blob/")) {
                return source
                        .replace("https://github.com/", "https://raw.githubusercontent.com/")
                        .replace("/blob/", "/");
            }
            throw new RuntimeException("Unsupported githubFileUrl format. Use raw.githubusercontent.com or github.com/.../blob/...");
        }

        if (isBlank(request.getRepository()) || isBlank(request.getFilePath())) {
            throw new RuntimeException("repository and filePath are required when githubFileUrl is not provided");
        }

        String branch = isBlank(request.getBranch()) ? "main" : request.getBranch().trim();
        String encodedPath = encodePath(request.getFilePath().trim());
        return "https://raw.githubusercontent.com/"
                + request.getRepository().trim()
                + "/"
                + branch
                + "/"
                + encodedPath;
    }

    private String fetchFile(String rawUrl, String githubToken) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(rawUrl))
                    .GET()
                    .timeout(Duration.ofSeconds(30))
                    .header("Accept", "*/*");

            if (!isBlank(githubToken)) {
                builder.header("Authorization", "token " + githubToken.trim());
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new RuntimeException("Failed to fetch GitHub testcase file (HTTP " + response.statusCode() + ")");
            }
            return response.body();
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("Failed to fetch GitHub testcase file: " + e.getMessage(), e);
        }
    }

    private ImportPayload parsePayload(String format, String body) {
        return switch (format) {
            case "json" -> parseJsonPayload(body);
            case "yaml" -> parseYamlPayload(body);
            case "spec" -> parseSpecPayload(body);
            default -> throw new RuntimeException("Unsupported testcase format. Use .json, .yml/.yaml, or .spec.ts");
        };
    }

    private ImportPayload parseJsonPayload(String body) {
        Map<String, Object> parsed = parseJsonMap(body);
        return new ImportPayload(
                asString(parsed.get("preMigrationUrl")),
                asString(parsed.get("postMigrationUrl")),
                extractStepsFromMap(parsed)
        );
    }

    private ImportPayload parseYamlPayload(String body) {
        try {
            Object loaded = yamlParser.load(body);
            if (!(loaded instanceof Map<?, ?> loadedMap)) {
                throw new RuntimeException("YAML testcase must contain an object with steps[]");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = (Map<String, Object>) loadedMap;
            return new ImportPayload(
                    asString(parsed.get("preMigrationUrl")),
                    asString(parsed.get("postMigrationUrl")),
                    extractStepsFromMap(parsed)
            );
        } catch (Exception e) {
            throw new RuntimeException("GitHub testcase YAML is invalid. Use keys: preMigrationUrl, postMigrationUrl, steps[]");
        }
    }

    private ImportPayload parseSpecPayload(String body) {
        String preUrl = extractValueWithPatterns(body, List.of(
                "preMigrationUrl\\s*[:=]\\s*['\\\"]([^'\\\"]+)['\\\"]",
                "PRE_MIGRATION_URL\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]"
        ));
        String postUrl = extractValueWithPatterns(body, List.of(
                "postMigrationUrl\\s*[:=]\\s*['\\\"]([^'\\\"]+)['\\\"]",
                "POST_MIGRATION_URL\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]"
        ));

        List<String> steps = extractStepsFromSpec(body);
        return new ImportPayload(preUrl, postUrl, steps);
    }

    private Map<String, Object> parseJsonMap(String body) {
        try {
            return jsonParser.parseMap(body);
        } catch (Exception e) {
            throw new RuntimeException("GitHub testcase JSON is invalid. Use keys: preMigrationUrl, postMigrationUrl, steps[]");
        }
    }

    private List<String> extractStepsFromMap(Map<String, Object> parsed) {
        Object rawSteps = parsed.get("steps");
        if (!(rawSteps instanceof List<?> rawList)) return new ArrayList<>();

        List<String> steps = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof String step && !step.trim().isEmpty()) {
                steps.add(step.trim());
            }
        }
        return steps;
    }

    private List<String> extractStepsFromSpec(String body) {
        LinkedHashSet<String> steps = new LinkedHashSet<>();

        // Preferred: explicit Playwright test.step labels
        Pattern stepPattern = Pattern.compile("test\\.step\\(\\s*['\"`]([^'\"`]+)['\"`]");
        Matcher stepMatcher = stepPattern.matcher(body);
        while (stepMatcher.find()) {
            String title = stepMatcher.group(1).trim();
            if (!title.isEmpty()) steps.add(title);
        }

        // Alternate: explicit inline comments (// STEP: ...)
        Pattern commentPattern = Pattern.compile("//\\s*STEP\\s*:\\s*(.+)");
        Matcher commentMatcher = commentPattern.matcher(body);
        while (commentMatcher.find()) {
            String comment = commentMatcher.group(1).trim();
            if (!comment.isEmpty()) steps.add(comment);
        }

        // Fallback heuristic from common Playwright actions
        if (steps.isEmpty()) {
            if (body.contains("page.goto(")) steps.add("Open login page");
            if (containsAny(body, List.of("username", "user name", "email")) && body.contains(".fill(")) {
                steps.add("Enter username");
            }
            if (containsAny(body, List.of("password", "pass")) && body.contains(".fill(")) {
                steps.add("Enter password");
            }
            if (body.contains(".click(")) steps.add("Click primary action button");
            if (body.contains(".selectOption(")) steps.add("Select required option");
            if (body.contains("expect(")) steps.add("Verify expected result");
        }

        return new ArrayList<>(steps);
    }

    private boolean containsAny(String source, List<String> terms) {
        String lowered = source.toLowerCase();
        for (String term : terms) {
            if (lowered.contains(term.toLowerCase())) return true;
        }
        return false;
    }

    private String extractValueWithPatterns(String source, List<String> patterns) {
        for (String regex : patterns) {
            Matcher matcher = Pattern.compile(regex).matcher(source);
            if (matcher.find()) {
                String value = matcher.group(1).trim();
                if (!value.isEmpty()) return value;
            }
        }
        return "";
    }

    private String resolveSourcePath(GitHubImportRequest request, String rawUrl) {
        if (!isBlank(request.getFilePath())) return request.getFilePath().trim();
        if (!isBlank(request.getGithubFileUrl())) return request.getGithubFileUrl().trim();
        return rawUrl;
    }

    private String inferFormat(String sourcePath, String body) {
        String lowered = sourcePath.toLowerCase();
        if (lowered.endsWith(".json")) return "json";
        if (lowered.endsWith(".yml") || lowered.endsWith(".yaml")) return "yaml";
        if (lowered.endsWith(".spec.ts") || lowered.endsWith(".spec.js") || lowered.endsWith(".ts")) return "spec";

        String trimmed = body.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
        if (trimmed.startsWith("---") || trimmed.contains("steps:")) return "yaml";
        if (trimmed.contains("test(") || trimmed.contains("test.step(")) return "spec";
        return "json";
    }

    private String encodePath(String filePath) {
        String[] parts = filePath.split("/");
        List<String> encoded = new ArrayList<>();
        for (String part : parts) {
            encoded.add(URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return String.join("/", encoded);
    }

    private String firstNonBlank(String first, String second) {
        if (!isBlank(first)) return first.trim();
        if (!isBlank(second)) return second.trim();
        return "";
    }

    private String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record ImportPayload(String preMigrationUrl, String postMigrationUrl, List<String> steps) {
    }
}

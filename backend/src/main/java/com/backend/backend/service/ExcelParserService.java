package com.backend.backend.service;

import com.backend.backend.model.TestRun;
import com.backend.backend.util.StepSanitizer;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ExcelParserService {

    private final TestRunService testRunService;

    public TestRun parseAndCreateTestRun(
            MultipartFile file,
            String appId,
            String appCredentials,
            String preMigrationUrl,
            String postMigrationUrl) {

        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {

            Sheet sheet = workbook.getSheetAt(0);

            List<String> steps = new ArrayList<>();

            DataFormatter formatter = new DataFormatter();

            for (Row row : sheet) {

                if (row.getRowNum() == 0) continue; // skip header row

                String step = formatter.formatCellValue(row.getCell(0));

                if (step != null && !step.isBlank()) {
                    String sanitized = StepSanitizer.sanitize(step);
                    if (!sanitized.isBlank()) {
                        steps.add(sanitized);
                    }
                }
            }

            TestRun testRun = new TestRun();
            testRun.setAppId(appId);
            testRun.setAppCredentials(appCredentials);
            testRun.setPreMigrationUrl(preMigrationUrl);
            testRun.setPostMigrationUrl(postMigrationUrl);
            testRun.setSteps(steps);

            return testRunService.createTestRun(testRun);

        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }
    }
}

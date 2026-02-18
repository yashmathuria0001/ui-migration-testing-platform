package com.backend.backend.service;

import com.backend.backend.model.TestRun;
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

    public TestRun parseAndCreateTestRun(MultipartFile file) {

        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {

            Sheet sheet = workbook.getSheetAt(0);

            String preUrl = null;
            String postUrl = null;
            List<String> steps = new ArrayList<>();

            DataFormatter formatter = new DataFormatter();

            for (Row row : sheet) {

                if (row.getRowNum() == 0) continue; // skip header row

                if (preUrl == null) {
                    preUrl = formatter.formatCellValue(row.getCell(0));
                }

                if (postUrl == null) {
                    postUrl = formatter.formatCellValue(row.getCell(1));
                }

                String step = formatter.formatCellValue(row.getCell(2));

                if (step != null && !step.isBlank()) {
                    steps.add(step);
                }
            }

            TestRun testRun = new TestRun();
            testRun.setPreMigrationUrl(preUrl);
            testRun.setPostMigrationUrl(postUrl);
            testRun.setSteps(steps);

            return testRunService.createTestRun(testRun);

        } catch (Exception e) {
            throw new RuntimeException("Failed to parse Excel file", e);
        }
    }
}

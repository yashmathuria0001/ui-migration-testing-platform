package com.backend.backend.controller;

import com.backend.backend.model.TestRun;
import com.backend.backend.service.ExcelParserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/testruns")
@RequiredArgsConstructor
public class UploadController {

    private final ExcelParserService excelParserService;

    @PostMapping("/upload")
    public TestRun uploadExcel(@RequestParam("file") MultipartFile file) {
        return excelParserService.parseAndCreateTestRun(file);
    }
}

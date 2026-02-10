package com.uimigration.platform.service;

import com.uimigration.platform.dto.TestCaseRequest;
import com.uimigration.platform.dto.TestCaseResponse;
import com.uimigration.platform.dto.TestStepResponse;
import com.uimigration.platform.model.TestCase;
import com.uimigration.platform.model.TestStep;
import com.uimigration.platform.repository.TestCaseRepository;
import com.uimigration.platform.repository.TestStepRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class TestCaseService {

    private final TestCaseRepository testCaseRepository;
    private final TestStepRepository testStepRepository;

    @Transactional
    public TestCaseResponse createTestCase(TestCaseRequest request) {
        TestCase testCase = TestCase.builder()
                .name(request.getName())
                .description(request.getDescription())
                .build();

        for (int i = 0; i < request.getSteps().size(); i++) {
            String instruction = request.getSteps().get(i);
            TestStep step = TestStep.builder()
                    .stepNumber(i + 1)
                    .instruction(instruction)
                    .build();
            testCase.addStep(step);
        }

        TestCase saved = testCaseRepository.save(testCase);
        // ensure steps are persisted and have IDs
        saved.getSteps().size();

        return toResponse(saved, saved.getSteps());
    }

    @Transactional(readOnly = true)
    public TestCaseResponse getTestCase(UUID id) {
        TestCase testCase = testCaseRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "TestCase not found: " + id));
        List<TestStep> steps = testStepRepository.findByTestCaseIdOrderByStepNumberAsc(id);
        return toResponse(testCase, steps);
    }

    private static TestCaseResponse toResponse(TestCase testCase, List<TestStep> steps) {
        List<TestStepResponse> stepDtos = steps.stream()
                .sorted(Comparator.comparingInt(TestStep::getStepNumber))
                .map(s -> TestStepResponse.builder()
                        .id(s.getId())
                        .stepNumber(s.getStepNumber())
                        .instruction(s.getInstruction())
                        .build())
                .toList();

        return TestCaseResponse.builder()
                .id(testCase.getId())
                .name(testCase.getName())
                .description(testCase.getDescription())
                .steps(stepDtos)
                .build();
    }
}


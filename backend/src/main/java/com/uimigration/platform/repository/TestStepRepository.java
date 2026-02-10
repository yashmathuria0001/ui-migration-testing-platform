package com.uimigration.platform.repository;

import com.uimigration.platform.model.TestStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TestStepRepository extends JpaRepository<TestStep, UUID> {
    List<TestStep> findByTestCaseIdOrderByStepNumberAsc(UUID testCaseId);
}


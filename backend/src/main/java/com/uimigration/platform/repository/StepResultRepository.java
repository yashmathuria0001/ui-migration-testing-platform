package com.uimigration.platform.repository;

import com.uimigration.platform.model.StepResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface StepResultRepository extends JpaRepository<StepResult, UUID> {
    List<StepResult> findByTestRunIdOrderByStepNumberAsc(UUID testRunId);
}


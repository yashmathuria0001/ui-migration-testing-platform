package com.uimigration.platform.repository;

import com.uimigration.platform.model.TestRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TestRunRepository extends JpaRepository<TestRun, UUID> {
}


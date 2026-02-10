package com.uimigration.platform.repository;

import com.uimigration.platform.model.TestCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TestCaseRepository extends JpaRepository<TestCase, UUID> {
}


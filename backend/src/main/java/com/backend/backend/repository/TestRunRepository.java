package com.backend.backend.repository;

import com.backend.backend.model.TestRun;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface TestRunRepository extends MongoRepository<TestRun, String> {
}

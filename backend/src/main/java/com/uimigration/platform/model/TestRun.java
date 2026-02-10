package com.uimigration.platform.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "test_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestRun {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID testCaseId;

    @Column(nullable = false, length = 2048)
    private String preMigrationUrl;

    @Column(nullable = false, length = 2048)
    private String postMigrationUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TestRunStatus status;

    @Column(nullable = false)
    private Instant createdAt;
}


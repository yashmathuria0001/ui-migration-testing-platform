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

import java.util.UUID;

@Entity
@Table(name = "step_results")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StepResult {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID testRunId;

    @Column(nullable = false)
    private int stepNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepStatus status;

    @Column(nullable = false, length = 4096)
    private String preScreenshotPath;

    @Column(nullable = false, length = 4096)
    private String postScreenshotPath;

    @Column(nullable = false, length = 4000)
    private String aiComment;
}


package com.uimigration.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestRunRequest {

    @NotNull
    private UUID testCaseId;

    @NotBlank
    @Size(max = 2048)
    private String preMigrationUrl;

    @NotBlank
    @Size(max = 2048)
    private String postMigrationUrl;
}


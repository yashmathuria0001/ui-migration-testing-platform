package com.uimigration.platform.dto;

import com.uimigration.platform.model.TestRunStatus;
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
public class TestRunResponse {
    private UUID runId;
    private TestRunStatus status;
}


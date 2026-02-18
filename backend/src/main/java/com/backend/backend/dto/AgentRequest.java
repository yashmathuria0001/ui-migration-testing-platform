package com.backend.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.List;

@Data
@AllArgsConstructor
public class AgentRequest {

    private String testRunId;
    private String preUrl;
    private String postUrl;
    private List<String> steps;
}

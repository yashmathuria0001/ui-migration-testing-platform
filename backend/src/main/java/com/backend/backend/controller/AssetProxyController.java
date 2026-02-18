package com.backend.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.net.URI;

@RestController
@RequestMapping("/api/assets")
@CrossOrigin
public class AssetProxyController {

    private static final String AGENT_BASE = "http://localhost:5000";
    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/screenshots/**")
    public ResponseEntity<byte[]> proxyScreenshot(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String path = requestUri.replace("/api/assets", "");
        if (!path.startsWith("/")) path = "/" + path;

        String url = AGENT_BASE + path;
        try {
            byte[] body = restTemplate.getForObject(URI.create(url), byte[].class);
            if (body == null) return ResponseEntity.notFound().build();

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setCacheControl("max-age=3600");
            return new ResponseEntity<>(body, headers, HttpStatus.OK);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}

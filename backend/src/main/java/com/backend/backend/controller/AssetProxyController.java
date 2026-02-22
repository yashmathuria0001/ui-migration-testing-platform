package com.backend.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientResponseException;

import java.net.URI;

@RestController
@RequestMapping("/api/assets")
@CrossOrigin
public class AssetProxyController {

    @Value("${agent.base-url:http://127.0.0.1:5000}")
    private String agentBaseUrl;
    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/screenshots/**")
    public ResponseEntity<byte[]> proxyScreenshot(HttpServletRequest request) {
        return proxyBinary(request, MediaType.IMAGE_PNG);
    }

    @GetMapping("/reports/**")
    public ResponseEntity<byte[]> proxyReport(HttpServletRequest request) {
        return proxyBinary(request, MediaType.TEXT_HTML);
    }

    private ResponseEntity<byte[]> proxyBinary(HttpServletRequest request, MediaType fallbackType) {
        String requestUri = request.getRequestURI();
        String path = requestUri.replace("/api/assets", "");
        if (!path.startsWith("/")) path = "/" + path;

        String url = agentBaseUrl + path;
        try {
            ResponseEntity<byte[]> response = restTemplate.getForEntity(URI.create(url), byte[].class);
            byte[] body = response.getBody();
            if (body == null) return ResponseEntity.notFound().build();

            HttpHeaders headers = new HttpHeaders();
            MediaType contentType = response.getHeaders().getContentType();
            headers.setContentType(contentType != null ? contentType : fallbackType);
            headers.setCacheControl("max-age=3600");
            return new ResponseEntity<>(body, headers, HttpStatus.OK);
        } catch (RestClientResponseException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}

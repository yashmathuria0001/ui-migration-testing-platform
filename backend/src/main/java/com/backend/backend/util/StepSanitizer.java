package com.backend.backend.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class StepSanitizer {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b");
    private static final Pattern ASSIGNMENT_PATTERN = Pattern.compile("\\b([A-Za-z][\\w.-]{1,40})\\b(\\s*(?:=|:|is|was)\\s*)(\"[^\"]+\"|'[^']+'|`[^`]+`|[^\\s,.;:!?]+)");
    private static final Pattern ACTION_TAIL_PATTERN = Pattern.compile("(?i)\\b(enter|fill|type|input|provide)\\b([^\\n]*?)\\s+([^\\s,.;:!?]+)");
    private static final Pattern QUOTED_VALUE_PATTERN = Pattern.compile("([\"'`])([^\"'`\\n]{4,})\\1");

    private StepSanitizer() {
    }

    public static String sanitize(String raw) {
        if (raw == null) return "";
        String value = raw.trim();
        if (value.isEmpty()) return "";

        value = EMAIL_PATTERN.matcher(value).replaceAll("");
        value = replaceAssignmentSecrets(value);
        value = replaceActionTailSecrets(value);
        value = replaceQuotedSecrets(value);
        return value.replaceAll("\\s{2,}", " ").trim();
    }

    private static String replaceAssignmentSecrets(String input) {
        Matcher matcher = ASSIGNMENT_PATTERN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String replacement = looksSecretLike(matcher.group(3))
                    ? matcher.group(1) + matcher.group(2).trim()
                    : matcher.group(0);
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private static String replaceActionTailSecrets(String input) {
        Matcher matcher = ACTION_TAIL_PATTERN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String tail = matcher.group(3);
            String replacement = (looksSecretLike(tail) || tail.contains("@"))
                    ? matcher.group(1) + matcher.group(2)
                    : matcher.group(0);
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private static String replaceQuotedSecrets(String input) {
        Matcher matcher = QUOTED_VALUE_PATTERN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String quote = matcher.group(1);
            String quotedValue = matcher.group(2);
            String replacement = looksSecretLike(quotedValue) ? "" : matcher.group(0);
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private static boolean looksSecretLike(String token) {
        if (token == null) return false;
        String candidate = token.trim().replaceAll("^[`'\\\"]|[`'\\\"]$", "");
        if (candidate.length() < 6 || candidate.contains(" ")) return false;

        boolean hasAlpha = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        for (int i = 0; i < candidate.length(); i++) {
            char c = candidate.charAt(i);
            if (Character.isLetter(c)) hasAlpha = true;
            else if (Character.isDigit(c)) hasDigit = true;
            else hasSpecial = true;
        }
        return (hasAlpha && hasDigit) || hasSpecial;
    }
}

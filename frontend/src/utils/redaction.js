function looksSecretLike(value) {
  const text = String(value ?? '').trim().replace(/^[`'"]|[`'"]$/g, '');
  if (text.length < 6 || text.includes(' ')) return false;
  const hasAlpha = /[A-Za-z]/.test(text);
  const hasDigit = /\d/.test(text);
  const hasSpecial = /[^A-Za-z0-9]/.test(text);
  return (hasAlpha && hasDigit) || hasSpecial;
}

export function maskSensitiveText(value) {
  let text = String(value ?? '');
  if (!text) return '';

  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '');
  text = text.replace(
    /\b([A-Za-z][\w.-]{1,40})\b(\s*(?:=|:|is|was)\s*)("[^"]+"|'[^']+'|`[^`]+`|[^\s,.;:!?]+)/g,
    (match, key, separator, rawValue) => (looksSecretLike(rawValue) ? `${key}${separator.trim()}` : match),
  );
  text = text.replace(
    /\b(enter|fill|type|input|provide)\b([^\n]*?)\s+([^\s,.;:!?]+)/gi,
    (match, action, middle, tailValue) => (
      looksSecretLike(tailValue) || String(tailValue).includes('@')
        ? `${action}${middle}`
        : match
    ),
  );
  text = text.replace(
    /(["'`])([^"'`\n]{4,})\1/g,
    (match, _quote, quotedValue) => (looksSecretLike(quotedValue) ? '' : match),
  );
  return text.replace(/\s{2,}/g, ' ').trim();
}

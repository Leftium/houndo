export const kagiCustomCssLimit = 40_000;

export function validateCandidateCss(css) {
  const errors = [];

  if (css.length > kagiCustomCssLimit) {
    errors.push(
      `Candidate is ${css.length} characters; Kagi's documented limit is ${kagiCustomCssLimit}.`,
    );
  }

  const forbidden = [
    [/@import\b/i, "@import is not allowed"],
    [/url\s*\(\s*["']?\s*(?:https?:|\/\/)/i, "remote URLs are not allowed"],
    [/javascript\s*:/i, "javascript: content is not allowed"],
    [/<\/?(?:script|style)\b/i, "HTML or executable content is not allowed"],
  ];

  for (const [pattern, message] of forbidden) {
    if (pattern.test(css)) {
      errors.push(message);
    }
  }

  return errors;
}

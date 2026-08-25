import assert from "node:assert/strict";
import test from "node:test";

import { validateCandidateCss } from "../src/core/css-policy.mjs";

test("accepts self-contained CSS", () => {
  assert.deepEqual(
    validateCandidateCss(".summarize { display: inline-flex; gap: 0.25rem; }"),
    [],
  );
});

test("rejects remote and executable content", () => {
  const errors = validateCandidateCss(`
    @import "https://example.com/theme.css";
    .x { background: url(https://example.com/image.png); }
  `);

  assert.equal(errors.includes("@import is not allowed"), true);
  assert.equal(errors.includes("remote URLs are not allowed"), true);
});

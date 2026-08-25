import assert from "node:assert/strict";
import test from "node:test";

import {
  eventsFromLine,
  validateEvent,
} from "../src/verifier/materialize.mjs";

const hashes = {
  capture: "capture",
  candidate: "candidate",
  assertions: "assertions",
  labBuild: "lab",
};

test("extracts verifier records nested in a gg JSONL record", () => {
  const event = {
    schemaVersion: 1,
    type: "houndo.verify.complete",
    complete: true,
    status: "pass",
    issueId: "11340",
    captureId: "capture-1",
    hashes,
  };
  const line = JSON.stringify({ msg: `HOUNDO_VERIFY ${JSON.stringify(event)}` });

  assert.deepEqual(eventsFromLine(line), [event]);
});

test("requires all current hashes", () => {
  const event = {
    schemaVersion: 1,
    type: "houndo.verify.complete",
    complete: true,
    issueId: "11340",
    captureId: "capture-1",
    hashes,
  };
  const current = { captureId: "capture-1", hashes };

  assert.equal(validateEvent(event, current, "11340"), true);
  assert.equal(
    validateEvent(
      { ...event, hashes: { ...hashes, assertions: "stale" } },
      current,
      "11340",
    ),
    false,
  );
});

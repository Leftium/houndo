import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { assertInsideStateRoot, statePath } from "../src/core/config.mjs";

test("keeps state paths inside the configured root", (context) => {
  const previousRoot = process.env.HOUNDO_STATE_ROOT;
  const root = path.join(process.cwd(), ".test-state");
  process.env.HOUNDO_STATE_ROOT = root;
  context.after(() => {
    if (previousRoot == null) delete process.env.HOUNDO_STATE_ROOT;
    else process.env.HOUNDO_STATE_ROOT = previousRoot;
  });

  assert.equal(statePath("work", "11340"), path.join(root, "work", "11340"));
  assert.equal(
    assertInsideStateRoot(path.join(root, "..local")),
    path.join(root, "..local"),
  );
  assert.throws(
    () => statePath("work", "..", "..", "outside"),
    /Refusing path outside Houndo state root/,
  );
});

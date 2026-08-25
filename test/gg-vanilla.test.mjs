import assert from "node:assert/strict";
import test from "node:test";

import { loadGgVanillaEntries } from "../src/lab/gg-vanilla.mjs";

test("loads gg runtime and file sink without importing Svelte", async () => {
  const { ggFileSinkPlugin, ggRuntimePath } = await loadGgVanillaEntries();

  assert.equal(typeof ggFileSinkPlugin, "function");
  assert.match(ggRuntimePath, /@leftium[/+]gg.*dist[/\\]gg\.js$/);
});

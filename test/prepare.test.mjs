import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareCss } from "../src/capture/prepare.mjs";
import { sha256 } from "../src/core/files.mjs";

test("prepares an allowlisted static preview and current pointer", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "houndo-prepare-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousRoot = process.env.HOUNDO_STATE_ROOT;
  process.env.HOUNDO_STATE_ROOT = root;
  context.after(() => {
    if (previousRoot == null) delete process.env.HOUNDO_STATE_ROOT;
    else process.env.HOUNDO_STATE_ROOT = previousRoot;
  });

  const captureId = "capture-1";
  const captureDir = path.join(root, "captures", captureId);
  const workDir = path.join(root, "work", "11340");
  await fs.mkdir(captureDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  const html = `<!doctype html><html><head><link href="/asset/site.css"><script src="/asset/site.js"></script></head><body><main><p class="description">Description</p><button class="summarize">Summarize</button></main></body></html>\n`;
  await fs.writeFile(path.join(captureDir, "search.html"), html);
  await fs.writeFile(
    path.join(captureDir, "manifest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      captureId,
      query: "example",
      viewport: { width: 1440, height: 1000 },
      files: [
        {
          renderer: "search",
          path: `captures/${captureId}/search.html`,
          contentHash: sha256(html),
        },
      ],
    })}\n`,
  );
  const css = ".summarize { display: inline-flex; }\n";
  await fs.writeFile(path.join(workDir, "candidate.css"), css);
  await fs.writeFile(
    path.join(workDir, "assertions.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      selectors: [
        { name: "summarize", selector: ".summarize", minMatches: 1 },
      ],
      geometry: [],
    })}\n`,
  );

  const current = await prepareCss({ issueId: "11340", captureId });
  const preview = await fs.readFile(
    path.join(root, current.previewPath),
    "utf8",
  );

  assert.equal(current.hashes.capture, sha256(html));
  assert.equal(current.hashes.candidate, sha256(css));
  assert.match(preview, /data-houndo-candidate=/);
  assert.match(preview, /https:\/\/kagi\.com\/asset\/site\.css/);
  assert.doesNotMatch(preview, /site\.js/);
});

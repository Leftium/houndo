import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256 } from "../src/core/files.mjs";
import { checkWork, initializeWork } from "../src/core/work.mjs";

test("initializes without overwriting and validates a reviewable work packet", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "houndo-work-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const previousRoot = process.env.HOUNDO_STATE_ROOT;
  process.env.HOUNDO_STATE_ROOT = root;
  context.after(() => {
    if (previousRoot == null) delete process.env.HOUNDO_STATE_ROOT;
    else process.env.HOUNDO_STATE_ROOT = previousRoot;
  });

  const initialized = await initializeWork("11340");
  assert.equal(initialized.created.length, 5);
  assert.equal((await initializeWork("11340")).created.length, 0);

  const workDir = path.join(root, "work", "11340");
  const css = ".summarize { display: inline-flex; }\n";
  const assertions = {
    schemaVersion: 1,
    selectors: [{ name: "target", selector: ".summarize" }],
    geometry: [],
  };
  await fs.writeFile(
    path.join(workDir, "sources.md"),
    "# Sources\n\n- https://kagifeedback.org/d/11340\n- https://help.kagi.com/kagi/features/custom-css.html\n",
  );
  await fs.writeFile(path.join(workDir, "candidate.css"), css);
  await fs.writeFile(
    path.join(workDir, "assertions.json"),
    `${JSON.stringify(assertions)}\n`,
  );
  await fs.writeFile(
    path.join(workDir, "verify.json"),
    `${JSON.stringify({
      status: "pass",
      hashes: {
        candidate: sha256(css),
        assertions: sha256(JSON.stringify(assertions)),
      },
    })}\n`,
  );
  await fs.writeFile(
    path.join(workDir, "reply.md"),
    `This is an optional experimental workaround. Open Appearance and append this to Custom CSS. To roll back, remove it or use no_css.\n\n\`\`\`css\n${css.trim()}\n\`\`\`\n\n_AI-generated with [Houndo](https://github.com/Leftium/houndo), an independent project reviewed by me. Houndo is not affiliated with Kagi._\n`,
  );

  assert.deepEqual(await checkWork("11340"), { ok: true, errors: [] });

  await fs.writeFile(
    path.join(workDir, "assertions.json"),
    `${JSON.stringify({ ...assertions, geometry: [{ kind: "below" }] })}\n`,
  );
  assert.equal(
    (await checkWork("11340")).errors.includes(
      "verify.json does not match assertions.json",
    ),
    true,
  );
});

import fs from "node:fs/promises";
import path from "node:path";

import { statePath } from "./config.mjs";
import { validateCandidateCss } from "./css-policy.mjs";
import {
  ensureDir,
  pathExists,
  readJson,
  sha256,
  writeFileAtomic,
} from "./files.mjs";

const defaultProjectUrl = "https://github.com/Leftium/houndo";

function projectUrl() {
  return process.env.HOUNDO_PROJECT_URL || defaultProjectUrl;
}

const templates = {
  "issue.md": (issueId) => `# Kagi Feedback issue ${issueId}\n\nSource: https://kagifeedback.org/d/${issueId}\n\nResearch pending.\n`,
  "sources.md": () => "# Sources\n\nResearch pending.\n",
  "candidate.css": () => "/* Issue-specific experimental Custom CSS. */\n",
  "assertions.json": () => `${JSON.stringify({
    schemaVersion: 1,
    selectors: [],
    geometry: [],
  }, null, 2)}\n`,
  "reply.md": () => `Draft pending.\n\n_AI-generated with [Houndo](${projectUrl()}), an independent project, and reviewed by me before posting. Houndo is not affiliated with or endorsed by Kagi._\n`,
};

export async function initializeWork(issueId) {
  const workDir = statePath("work", String(issueId));
  await ensureDir(workDir);
  const created = [];
  for (const [name, template] of Object.entries(templates)) {
    const filePath = path.join(workDir, name);
    if (await pathExists(filePath)) continue;
    await writeFileAtomic(filePath, template(issueId));
    created.push(name);
  }
  return { workDir, created };
}

function fencedCss(markdown) {
  return [...markdown.matchAll(/```css\s*\n([\s\S]*?)```/gi)].map((match) =>
    match[1].trim(),
  );
}

export async function checkWork(issueId) {
  const workDir = statePath("work", String(issueId));
  const required = [
    "issue.md",
    "sources.md",
    "candidate.css",
    "assertions.json",
    "verify.json",
    "reply.md",
  ];
  const errors = [];

  for (const name of required) {
    if (!(await pathExists(path.join(workDir, name)))) errors.push(`Missing ${name}`);
  }
  if (errors.length) return { ok: false, errors };

  const [issue, sources, css, assertions, verify, reply] = await Promise.all([
    fs.readFile(path.join(workDir, "issue.md"), "utf8"),
    fs.readFile(path.join(workDir, "sources.md"), "utf8"),
    fs.readFile(path.join(workDir, "candidate.css"), "utf8"),
    readJson(path.join(workDir, "assertions.json")),
    readJson(path.join(workDir, "verify.json")),
    fs.readFile(path.join(workDir, "reply.md"), "utf8"),
  ]);

  if (!issue.includes(`kagifeedback.org/d/${issueId}`)) {
    errors.push("issue.md does not name the target discussion URL");
  }
  if ((sources.match(/https?:\/\//g) ?? []).length < 2) {
    errors.push("sources.md needs at least two public source URLs");
  }
  errors.push(...validateCandidateCss(css));
  if (!assertions.selectors?.length) errors.push("assertions.json has no selectors");
  if (verify.status !== "pass") errors.push("verify.json is not passing");
  if (verify.hashes?.candidate !== sha256(css)) {
    errors.push("verify.json does not match candidate.css");
  }
  if (verify.hashes?.assertions !== sha256(JSON.stringify(assertions))) {
    errors.push("verify.json does not match assertions.json");
  }
  if (!fencedCss(reply).includes(css.trim())) {
    errors.push("reply.md does not contain the exact candidate CSS");
  }
  if (!/AI-generated/i.test(reply) || !reply.includes(projectUrl())) {
    errors.push("reply.md is missing the required disclosure and project link");
  }
  if (!/optional|personal|experimental/i.test(reply)) {
    errors.push("reply.md does not frame the workaround as optional or experimental");
  }
  if (!/Appearance/i.test(reply) || !/Custom CSS/i.test(reply)) {
    errors.push("reply.md is missing Custom CSS application instructions");
  }
  if (!/remove/i.test(reply) || !/no_css/i.test(reply)) {
    errors.push("reply.md is missing removal and no_css rollback instructions");
  }
  if (!/not affiliated|independent/i.test(reply)) {
    errors.push("reply.md is missing independence language");
  }

  return { ok: errors.length === 0, errors };
}

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadLocalEnv, statePath } from "../core/config.mjs";
import { pathExists, readJson } from "../core/files.mjs";
import { checkWork, initializeWork } from "../core/work.mjs";

loadLocalEnv();

const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function requireArgument(value, label) {
  if (!value || value.startsWith("--")) throw new Error(`Missing ${label}.`);
  return value;
}

function help() {
  console.log(`Houndo issue-research workbench

Usage:
  houndo work init <issue-id>
  houndo serp capture --query <query> [--renderer search|html|both]
  houndo serp list
  houndo css prepare <issue-id> --capture <capture-id> [--renderer search|html]
  houndo css verify <issue-id>
  houndo check-work <issue-id>`);
}

async function listCaptures() {
  const root = statePath("captures");
  if (!(await pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const captures = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, "manifest.json");
    if (await pathExists(manifestPath)) captures.push(await readJson(manifestPath));
  }
  return captures.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function main() {
  const [group, command, operand] = args;

  if (!group || group === "--help" || group === "-h") {
    help();
    return;
  }

  if (group === "work" && command === "init") {
    const result = await initializeWork(requireArgument(operand, "issue ID"));
    console.log(
      result.created.length
        ? `Initialized ${result.workDir}: ${result.created.join(", ")}`
        : `Work directory already initialized: ${result.workDir}`,
    );
    return;
  }

  if (group === "serp" && command === "capture") {
    const { captureSerp } = await import("../capture/live.mjs");
    const result = await captureSerp({
      query: requireArgument(option("--query"), "--query"),
      renderer: option("--renderer", "search"),
    });
    console.log(`Captured ${result.captureId}: ${result.query}`);
    for (const file of result.files) {
      console.log(`- ${file.renderer}: ${file.path}${file.warnings.length ? ` (${file.warnings.join(" ")})` : ""}`);
    }
    return;
  }

  if (group === "serp" && command === "list") {
    const captures = await listCaptures();
    if (!captures.length) {
      console.log("No captures.");
      return;
    }
    for (const capture of captures) {
      console.log(
        `${capture.captureId}\t${capture.files.map((file) => file.renderer).join(",")}\t${capture.query}`,
      );
    }
    return;
  }

  if (group === "css" && command === "prepare") {
    const { prepareCss } = await import("../capture/prepare.mjs");
    const result = await prepareCss({
      issueId: requireArgument(operand, "issue ID"),
      captureId: requireArgument(option("--capture"), "--capture"),
      renderer: option("--renderer"),
    });
    console.log(
      `Prepared issue ${result.issueId} with ${result.captureId} (${result.renderer}).`,
    );
    return;
  }

  if (group === "css" && command === "verify") {
    const { materializeVerification } = await import(
      "../verifier/materialize.mjs"
    );
    const { event, outputPath } = await materializeVerification(
      requireArgument(operand, "issue ID"),
    );
    console.log(`Materialized ${event.status} verification: ${outputPath}`);
    if (event.status === "fail") process.exitCode = 4;
    if (event.status === "inconclusive") process.exitCode = 5;
    return;
  }

  if (group === "check-work") {
    const result = await checkWork(requireArgument(command, "issue ID"));
    if (result.ok) {
      console.log(`Issue ${command} work is ready for human review.`);
    } else {
      result.errors.forEach((error) => console.error(`- ${error}`));
      process.exitCode = 6;
    }
    return;
  }

  help();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

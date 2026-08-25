import fs from "node:fs/promises";
import path from "node:path";

import { projectRoot, statePath } from "../core/config.mjs";
import { pathExists, readJson, writeJsonAtomic } from "../core/files.mjs";

const marker = "HOUNDO_VERIFY ";

function stringsIn(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, output));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => stringsIn(entry, output));
  }
  return output;
}

export function eventsFromLine(line) {
  try {
    const record = JSON.parse(line);
    return stringsIn(record).flatMap((value) => {
      const markerIndex = value.indexOf(marker);
      if (markerIndex < 0) return [];
      try {
        return [JSON.parse(value.slice(markerIndex + marker.length))];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function validateEvent(event, current, issueId) {
  if (
    event?.schemaVersion !== 1 ||
    event.type !== "houndo.verify.complete" ||
    event.complete !== true
  ) {
    return false;
  }
  if (String(event.issueId) !== String(issueId)) return false;
  if (event.captureId !== current.captureId) return false;
  return ["capture", "candidate", "assertions", "labBuild"].every(
    (key) => event.hashes?.[key] === current.hashes?.[key],
  );
}

export async function materializeVerification(issueId) {
  const currentPath = statePath("lab", "current.json");
  if (!(await pathExists(currentPath))) throw new Error("No prepared lab state exists.");
  const current = await readJson(currentPath);
  if (String(current.issueId) !== String(issueId)) {
    throw new Error(`Lab is prepared for issue ${current.issueId}, not ${issueId}.`);
  }

  const logPath = path.join(projectRoot, ".gg", "logs-5174.jsonl");
  if (!(await pathExists(logPath))) {
    throw new Error("No gg log exists. Open /lab/ with pnpm dev first.");
  }
  const lines = (await fs.readFile(logPath, "utf8")).split("\n").filter(Boolean);
  const events = lines.flatMap(eventsFromLine);
  const event = events.toReversed().find((candidate) =>
    validateEvent(candidate, current, issueId),
  );
  if (!event) {
    throw new Error("No complete verifier event matches the current hashes.");
  }

  const outputPath = statePath("work", String(issueId), "verify.json");
  await writeJsonAtomic(outputPath, event);
  return { event, outputPath };
}

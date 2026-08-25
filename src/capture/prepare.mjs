import fs from "node:fs/promises";
import path from "node:path";

import * as cheerio from "cheerio";

import {
  assertInsideStateRoot,
  projectRoot,
  statePath,
  stateRoot,
} from "../core/config.mjs";
import { validateCandidateCss } from "../core/css-policy.mjs";
import {
  ensureDir,
  pathExists,
  readJson,
  relativePosix,
  sha256,
  sha256File,
  writeFileAtomic,
  writeJsonAtomic,
} from "../core/files.mjs";

const kagiOrigin = "https://kagi.com";
const verifierFiles = [
  path.join(projectRoot, "vite.config.js"),
  path.join(projectRoot, "src/lab/gg-vanilla.mjs"),
  path.join(projectRoot, "src/lab/vite-plugin.mjs"),
  path.join(projectRoot, "src/lab/main.js"),
  path.join(projectRoot, "src/verifier/browser.js"),
];

function rewriteAssetUrl(value) {
  if (!value || /^(?:https?:|data:|blob:|#)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${kagiOrigin}${value}`;
  return value;
}

function prepareHtml(html, css, metadata) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $("script, meta[http-equiv='Content-Security-Policy' i]").remove();
  $("base").remove();
  $("head").prepend('<base href="https://kagi.com/">');
  $("link[href]").each((_, element) => {
    const node = $(element);
    node.attr("href", rewriteAssetUrl(node.attr("href")));
  });
  $("img[src], source[src], video[poster]").each((_, element) => {
    const node = $(element);
    for (const attribute of ["src", "poster"]) {
      if (node.attr(attribute)) {
        node.attr(attribute, rewriteAssetUrl(node.attr(attribute)));
      }
    }
  });
  $("img[srcset], source[srcset]").each((_, element) => {
    const node = $(element);
    const srcset = node.attr("srcset");
    if (!srcset) return;
    node.attr(
      "srcset",
      srcset
        .split(",")
        .map((candidate) => {
          const parts = candidate.trim().split(/\s+/);
          parts[0] = rewriteAssetUrl(parts[0]);
          return parts.join(" ");
        })
        .join(", "),
    );
  });

  $("head").append(
    `<style data-houndo-candidate="${metadata.candidateHash}">\n${css}\n</style>`,
  );
  $("html")
    .attr("data-houndo-capture", metadata.captureId)
    .attr("data-houndo-renderer", metadata.renderer)
    .attr("data-houndo-candidate-hash", metadata.candidateHash);

  return $.html();
}

async function combinedFileHash(filePaths) {
  const entries = await Promise.all(
    filePaths.map(async (filePath) => [
      relativePosix(projectRoot, filePath),
      await sha256File(filePath),
    ]),
  );
  return sha256(JSON.stringify(entries));
}

export async function prepareCss({ issueId, captureId, renderer }) {
  const workDir = statePath("work", issueId);
  const candidatePath = path.join(workDir, "candidate.css");
  const assertionsPath = path.join(workDir, "assertions.json");
  const manifestPath = statePath("captures", captureId, "manifest.json");

  for (const requiredPath of [candidatePath, assertionsPath, manifestPath]) {
    if (!(await pathExists(requiredPath))) {
      throw new Error(`Missing required file: ${requiredPath}`);
    }
  }

  const manifest = await readJson(manifestPath);
  const selected = renderer
    ? manifest.files.find((entry) => entry.renderer === renderer)
    : manifest.files[0];
  if (!selected) throw new Error("Requested renderer is not present in capture.");

  const capturePath = assertInsideStateRoot(
    path.join(stateRoot(), ...selected.path.split("/")),
  );
  const [captureHtml, candidateCss, assertions] = await Promise.all([
    fs.readFile(capturePath, "utf8"),
    fs.readFile(candidatePath, "utf8"),
    readJson(assertionsPath),
  ]);
  const cssErrors = validateCandidateCss(candidateCss);
  if (cssErrors.length) throw new Error(cssErrors.join("; "));

  const hashes = {
    capture: sha256(captureHtml),
    candidate: sha256(candidateCss),
    assertions: sha256(JSON.stringify(assertions)),
    labBuild: await combinedFileHash(verifierFiles),
  };
  if (selected.contentHash && selected.contentHash !== hashes.capture) {
    throw new Error("Capture content no longer matches its manifest hash.");
  }

  const previewPath = statePath("previews", issueId, captureId, "index.html");
  await ensureDir(path.dirname(previewPath));
  const previewHtml = prepareHtml(captureHtml, candidateCss, {
    captureId,
    renderer: selected.renderer,
    candidateHash: hashes.candidate,
  });
  await writeFileAtomic(previewPath, previewHtml);

  const current = {
    schemaVersion: 1,
    issueId: String(issueId),
    captureId,
    query: manifest.query,
    renderer: selected.renderer,
    viewport: manifest.viewport,
    preparedAt: new Date().toISOString(),
    candidatePath: relativePosix(stateRoot(), candidatePath),
    assertionsPath: relativePosix(stateRoot(), assertionsPath),
    previewPath: relativePosix(stateRoot(), previewPath),
    hashes,
  };
  await writeJsonAtomic(statePath("lab", "current.json"), current);
  return current;
}

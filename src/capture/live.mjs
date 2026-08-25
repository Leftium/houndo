import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

import { statePath, stateRoot } from "../core/config.mjs";
import {
  ensureDir,
  pathExists,
  relativePosix,
  sha256,
  writeJsonAtomic,
} from "../core/files.mjs";

const viewport = { width: 1440, height: 1000 };
const browserCandidates = [
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "query";
}

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function findBrowserExecutable() {
  const configured = process.env.KAGI_BROWSER_EXECUTABLE;
  if (configured) {
    if (!(await pathExists(configured))) {
      throw new Error("KAGI_BROWSER_EXECUTABLE does not exist.");
    }
    return configured;
  }

  for (const candidate of browserCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No supported Chromium browser was found. Set KAGI_BROWSER_EXECUTABLE in .env.",
  );
}

function renderersFor(value) {
  if (value === "both") return ["search", "html"];
  if (value === "search" || value === "html") return [value];
  throw new Error("Renderer must be search, html, or both.");
}

function searchUrl(query, renderer) {
  const pathname = renderer === "html" ? "/html/search" : "/search";
  const url = new URL(pathname, "https://kagi.com");
  url.searchParams.set("q", query);
  return url.href;
}

function captureWarnings(html) {
  const warnings = [];
  if (/<input[^>]+type=["']?password/i.test(html)) {
    warnings.push("Capture contains a password input.");
  }
  if (/\bBearer\s+[A-Za-z0-9._~-]+/i.test(html)) {
    warnings.push("Capture may contain a bearer token.");
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(html)) {
    warnings.push("Capture contains an email-like value.");
  }
  return warnings;
}

async function loadSearch(page, url, sessionLink) {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const needsAuthentication =
    /\/signin|\/login/i.test(page.url()) ||
    !(await page.locator("._0_main-search-results, main, #main").count());

  if (needsAuthentication && sessionLink) {
    try {
      await page.goto(sessionLink, { waitUntil: "domcontentloaded" });
    } catch {
      throw new Error("KAGI_SESSION_LINK could not authenticate the browser profile.");
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  if (/\/signin|\/login/i.test(page.url())) {
    throw new Error(
      "Kagi authentication is required. Add KAGI_SESSION_LINK to .env or authenticate the persistent profile.",
    );
  }

  await page.waitForSelector("._0_main-search-results, main, #main", {
    timeout: 20_000,
  });
  await page.waitForTimeout(1_000);
}

export async function captureSerp({ query, renderer = "search", parentId = null }) {
  if (!query?.trim()) throw new Error("A non-empty --query is required.");

  const executablePath = await findBrowserExecutable();
  const profilePath = statePath("browser-profile");
  await ensureDir(profilePath);

  const context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: false,
    viewport,
  });

  const createdAt = new Date();
  const captureId = `${timestampId(createdAt)}-${slugify(query)}-${sha256(`${query}:${createdAt.toISOString()}`).slice(0, 8)}`;
  const captureDir = statePath("captures", captureId);
  const files = [];

  try {
    for (const selectedRenderer of renderersFor(renderer)) {
      const page = await context.newPage();
      const sourceUrl = searchUrl(query, selectedRenderer);
      await loadSearch(page, sourceUrl, process.env.KAGI_SESSION_LINK);
      const html = await page.content();
      const body = html.endsWith("\n") ? html : `${html}\n`;
      const filePath = path.join(captureDir, `${selectedRenderer}.html`);
      await ensureDir(captureDir);
      await fs.writeFile(filePath, body);
      files.push({
        renderer: selectedRenderer,
        path: relativePosix(stateRoot(), filePath),
        sourceUrl,
        contentHash: sha256(body),
        bytes: Buffer.byteLength(body),
        warnings: captureWarnings(html),
      });
      await page.close();
    }
  } finally {
    await context.close();
  }

  const manifest = {
    schemaVersion: 1,
    captureId,
    parentCaptureId: parentId,
    query,
    createdAt: createdAt.toISOString(),
    browser: path.basename(executablePath),
    viewport,
    files,
  };
  await writeJsonAtomic(path.join(captureDir, "manifest.json"), manifest);
  return manifest;
}

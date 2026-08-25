import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeFileAtomic(filePath, body) {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, body);
  await fs.rename(temporaryPath, filePath);
}

export async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

export function relativePosix(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

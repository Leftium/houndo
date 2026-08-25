import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function loadLocalEnv() {
  for (const name of [".env", ".env.local"]) {
    const envPath = path.join(projectRoot, name);
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
}

export function stateRoot() {
  return path.resolve(
    process.env.HOUNDO_STATE_ROOT || path.join(projectRoot, ".houndo"),
  );
}

export function statePath(...parts) {
  return assertInsideStateRoot(path.join(stateRoot(), ...parts));
}

export function assertInsideStateRoot(filePath) {
  const root = stateRoot();
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing path outside Houndo state root: ${resolved}`);
  }

  return resolved;
}

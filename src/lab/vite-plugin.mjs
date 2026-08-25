import fs from "node:fs/promises";
import path from "node:path";

import { assertInsideStateRoot, statePath, stateRoot } from "../core/config.mjs";
import { pathExists, readJson } from "../core/files.mjs";
import { prepareCss } from "../capture/prepare.mjs";

const currentPath = statePath("lab", "current.json");

async function loadCurrent() {
  if (!(await pathExists(currentPath))) return null;
  return readJson(currentPath);
}

function artifactPath(relativePath) {
  return assertInsideStateRoot(path.join(stateRoot(), relativePath));
}

export function houndoLabPlugin() {
  return {
    name: "houndo-lab",
    apply: "serve",
    configureServer(server) {
      async function watchSelected(current) {
        if (!current) return;
        server.watcher.add([
          artifactPath(current.candidatePath),
          artifactPath(current.assertionsPath),
        ]);
      }

      server.watcher.add(currentPath);
      loadCurrent().then(watchSelected).catch(() => {});

      server.watcher.on("change", async (changedPath) => {
        const current = await loadCurrent();
        if (!current) return;

        if (path.resolve(changedPath) === path.resolve(currentPath)) {
          await watchSelected(current);
          server.ws.send({ type: "full-reload", path: "/lab/" });
          return;
        }

        const watched = [current.candidatePath, current.assertionsPath].map(
          artifactPath,
        );
        if (watched.some((filePath) => path.resolve(filePath) === path.resolve(changedPath))) {
          try {
            await prepareCss({
              issueId: current.issueId,
              captureId: current.captureId,
              renderer: current.renderer,
            });
          } finally {
            server.ws.send({ type: "full-reload", path: "/lab/" });
          }
        }
      });

      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url, "http://127.0.0.1");
        if (requestUrl.pathname === "/__houndo/state") {
          const current = await loadCurrent();
          if (!current) {
            response.statusCode = 404;
            response.end("No prepared work");
            return;
          }
          const assertions = await readJson(artifactPath(current.assertionsPath));
          const publicState = {
            schemaVersion: current.schemaVersion,
            issueId: current.issueId,
            captureId: current.captureId,
            query: current.query,
            renderer: current.renderer,
            viewport: current.viewport,
            preparedAt: current.preparedAt,
            hashes: current.hashes,
          };
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify({ state: publicState, assertions }));
          return;
        }

        if (requestUrl.pathname === "/__houndo/preview") {
          const current = await loadCurrent();
          if (!current) {
            response.statusCode = 404;
            response.end("No prepared preview");
            return;
          }
          const body = await fs.readFile(artifactPath(current.previewPath), "utf8");
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(body);
          return;
        }

        next();
      });
    },
  };
}

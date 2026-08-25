import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function loadGgVanillaEntries() {
  const packageEntry = fileURLToPath(import.meta.resolve("@leftium/gg"));
  const distDir = path.dirname(packageEntry);
  const ggRuntimePath = path.join(distDir, "gg.js");
  const fileSinkUrl = pathToFileURL(
    path.join(distDir, "gg-file-sink-plugin.js"),
  ).href;
  const { default: ggFileSinkPlugin } = await import(fileSinkUrl);

  return { ggFileSinkPlugin, ggRuntimePath };
}

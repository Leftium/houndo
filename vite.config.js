import { defineConfig } from "vite";

import { loadGgVanillaEntries } from "./src/lab/gg-vanilla.mjs";
import { houndoLabPlugin } from "./src/lab/vite-plugin.mjs";

export default defineConfig(async () => {
  const { ggFileSinkPlugin, ggRuntimePath } = await loadGgVanillaEntries();

  return {
    plugins: [ggFileSinkPlugin(), houndoLabPlugin()],
    resolve: {
      alias: {
        "@leftium/gg": ggRuntimePath,
        "@houndo/gg": ggRuntimePath,
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      open: "/lab/",
    },
  };
});

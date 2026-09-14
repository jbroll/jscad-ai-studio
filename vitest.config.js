import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    env: {
      JSCAD_VIEWER_ROOT: fileURLToPath(new URL("../jscadui/apps/jscad-web/build", import.meta.url)),
    },
  },
});

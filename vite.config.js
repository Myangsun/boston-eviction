import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [".."],
    },
    base: "./",
    build: {
      outDir: "docs", // dump the build right into docs/
    },
  },
});

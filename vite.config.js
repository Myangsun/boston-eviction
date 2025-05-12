import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  base: "./", // Changed to relative path for more flexibility
  server: {
    fs: {
      allow: [".."],
    },
  },
  // Add build options to improve reliability
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    // Improve chunk loading reliability
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {},
      },
    },
  },
});

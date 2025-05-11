import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  base: './', // Changed to relative path for more flexibility
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
        manualChunks: {
          // Split large dependencies into separate chunks
          mapbox: ['mapbox-gl'],
          d3: ['d3'],
          turf: ['@turf/turf']
        }
      }
    }
  }
});

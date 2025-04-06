// svelte.config.js
import adapter from "@sveltejs/adapter-static";

const config = {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      precompress: false,
    }),
    prerender: {
      handleHttpError: "warn",
    },
    // Hard-code base path to always be /boston-eviction
    paths: {
      base: "/boston-eviction",
    },
  },
};

export default config;

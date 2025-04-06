import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const dev = process.env.NODE_ENV === "development";

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
    paths: {
      base: dev ? "" : "/boston-eviction",
    },
  },
};

export default config;

import { defineConfig } from "vite";

// esbuild is deliberately disabled: the deployment environment blocked its
// temporary-file cleanup. TypeScript is compiled by `tsc` first; Vite only
// bundles the emitted JavaScript and CSS.
export default defineConfig({
  base: "./",
  esbuild: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: false,
    cssMinify: false,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
});

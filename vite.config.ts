import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the build work from a GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2021", chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"] },
} as never);

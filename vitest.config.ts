import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/test/*.test.ts"],
        },
        resolve: {
          alias: { "@": path.resolve(__dirname, "./src") },
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.tsx"],
        },
        resolve: {
          alias: { "@": path.resolve(__dirname, "./src") },
        },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

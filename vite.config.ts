import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // ⚠️ manualChunks RETIRÉ (incident 03/07) : séparer React de ses consommateurs
  // (radix/motion/tanstack) dans des chunks distincts provoquait au runtime
  // `Cannot read properties of undefined (reading 'forwardRef')` — React n'était
  // pas dispo quand le chunk Radix s'évaluait. On revient au découpage par défaut
  // de Rollup (routes déjà lazy = sain). Re-tenter la perf #258 plus tard AVEC un
  // vrai chargement du build de prod (pas seulement une mesure de taille).
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "framer-motion", "motion-dom", "motion-utils"],
  },
}));

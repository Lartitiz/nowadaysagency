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
  // ⚠️ LEÇON #258 (incident 03/07) : NE JAMAIS séparer React de ses consommateurs
  // (radix/motion/tanstack) dans des chunks distincts → au runtime
  // `Cannot read properties of undefined (reading 'forwardRef')` (cycle d'init ESM,
  // React pas dispo quand le chunk Radix s'évalue).
  //
  // Split SÛR (ce code) : on ne sort QUE des libs lourdes qui n'importent PAS React
  // → aucun cycle possible avec React. supabase (eager, SessionContext/AuthContext)
  // et date-fns sont des feuilles pures. Gain = chunks vendor cacheables (inchangés
  // quand le code app change) + téléchargement parallèle. Tout le reste (React,
  // radix, motion, router) RESTE ensemble dans le chunk par défaut.
  // Vérifié en CHARGEANT le build de prod (`npm run check-build`, garde-fou #272).
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("date-fns")) return "date-fns";
          // tout le reste : découpage Rollup par défaut (React + consommateurs ensemble)
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "framer-motion", "motion-dom", "motion-utils"],
  },
}));

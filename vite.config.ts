import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Page d'accueil (cible des pubs) : le morceau de JS/CSS de LandingPage n'est
// connu qu'après le téléchargement du JS principal, ce qui ajoute un aller-retour
// réseau avant le premier affichage. Ce plugin ajoute au HTML un petit script
// qui, UNIQUEMENT sur « / », demande ces fichiers dès la lecture de la page
// (modulepreload / preload). Aucun changement de découpage des chunks : c'est
// une simple anticipation de téléchargement, les autres pages ne chargent rien de plus.
function preloadLandingOnHome(): Plugin {
  return {
    name: "preload-landing-on-home",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === "chunk") as any[];
        const landing = chunks.find((c) => c.facadeModuleId?.endsWith("/src/pages/LandingPage.tsx"));
        const entry = chunks.find((c) => c.isEntry);
        if (!landing || !entry) return html;
        const already = new Set<string>([entry.fileName, ...entry.imports]);
        const js: string[] = [];
        const css: string[] = [];
        const walk = (name: string) => {
          const c = bundle[name] as any;
          if (!c || c.type !== "chunk" || already.has(name) || js.includes(name)) return;
          js.push(name);
          for (const f of c.viteMetadata?.importedCss ?? []) if (!css.includes(f)) css.push(f);
          for (const dep of c.imports) walk(dep);
        };
        walk(landing.fileName);
        const files = JSON.stringify({ js: js.map((f) => "/" + f), css: css.map((f) => "/" + f) });
        const script =
          `<script>(function(){if(location.pathname!=="/")return;var f=${files};` +
          `f.js.forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=h;document.head.appendChild(l);});` +
          `f.css.forEach(function(h){var l=document.createElement("link");l.rel="preload";l.as="style";l.crossOrigin="";l.href=h;document.head.appendChild(l);});})();</script>`;
        return html.replace("</head>", `    ${script}\n  </head>`);
      },
    },
  };
}

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
  plugins: [react(), mode === "development" && componentTagger(), preloadLandingOnHome()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "framer-motion", "motion-dom", "motion-utils"],
  },
}));

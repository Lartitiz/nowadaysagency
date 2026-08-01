import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import nowadays from "./eslint-rules/require-dialog-title.js";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      nowadays,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Doublon assumé avec eslint.a11y.config.js : ici pour le retour dans
      // l'éditeur, là-bas pour le verrou CI (ce fichier est `continue-on-error`).
      "nowadays/require-dialog-title": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `any` est omniprésent (surtout Edge Functions Deno) et noie le vrai signal
      // (hooks mal utilisés, expressions mortes…). On le rétrograde en warning pour
      // que `eslint .` reste exploitable au lieu de cracher ~2500 erreurs.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);

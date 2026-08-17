import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import dialogTitle from "./eslint-rules/require-dialog-title.js";
import supabaseErrorCheck from "./eslint-rules/require-supabase-error-check.js";
import {
  DETTE_SUPABASE_ERROR_CHECK,
  EXCLUSIONS_TESTS_SUPABASE_ERROR_CHECK,
} from "./eslint-rules/dette-supabase-error-check.js";

const nowadays = {
  rules: {
    ...dialogTitle.rules,
    ...supabaseErrorCheck.rules,
  },
};


// Config dédiée, volontairement séparée de eslint.config.js.
//
// `npm run lint` est en `continue-on-error` dans la CI (dette legacy : ~1054
// `as any`), donc une règle ajoutée là-bas n'aurait bloqué personne. Ici on ne
// charge QUE les règles à zéro dette, ce qui permet à `npm run lint:a11y` d'être
// une étape CI bloquante.
export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.tsx"],
    ignores: ["supabase/functions/**"],
    // Les `eslint-disable react-hooks/*` du code visent la config principale ;
    // ici la règle n'est pas activée, donc ils sont « inutilisés » sans l'être.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks n'est là que pour rendre résolvables les `eslint-disable
    // react-hooks/exhaustive-deps` déjà posés dans le code : aucune de ses
    // règles n'est activée ici.
    plugins: { nowadays, "react-hooks": reactHooks },
    rules: {
      "nowadays/require-dialog-title": "error",
    },
  },
  // Écritures Supabase dont l'erreur n'est pas lue (« succès menteur »).
  // Couvre le front (src/) ET les edge functions (supabase/functions/), hors
  // tests : les fakes des tests écrivent via la même API et ne risquent rien.
  {
    files: ["src/**/*.{ts,tsx}", "supabase/functions/**/*.ts"],
    // Dette du 17/08/2026 gelée dans une liste partagée avec eslint.config.js
    // (voir eslint-rules/dette-supabase-error-check.js) : la règle ne bloque
    // que ce qui s'AJOUTE.
    ignores: [
      ...EXCLUSIONS_TESTS_SUPABASE_ERROR_CHECK,
      ...DETTE_SUPABASE_ERROR_CHECK,
    ],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks et @typescript-eslint ne sont là que pour rendre résolvables
    // les `eslint-disable` déjà posés dans le code (sinon ESLint sort une
    // erreur « Definition for rule not found ») : aucune de leurs règles n'est
    // activée ici.
    plugins: {
      nowadays,
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "nowadays/require-supabase-error-check": "error",
    },
  },
);

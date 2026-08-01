import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nowadays from "./eslint-rules/require-dialog-title.js";

// Config dédiée, volontairement séparée de eslint.config.js.
//
// `npm run lint` est en `continue-on-error` dans la CI (dette legacy : ~1054
// `as any`), donc une règle ajoutée là-bas n'aurait bloqué personne. Ici on ne
// charge QUE les règles à zéro dette, ce qui permet à `npm run lint:a11y` d'être
// une étape CI bloquante.
export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase/functions/**"] },
  {
    files: ["**/*.tsx"],
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
);

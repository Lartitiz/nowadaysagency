# Architecture decisions

- Studio image actions are described as clickable words in a chat sentence (no hidden menu, no "Créer un contenu" button in that section), so every action is explained in place.
- Higgsfield Marketing Studio prompts are fitted to the provider 5000-char limit by condensing only generic boilerplate; the current confirmed request is never cut. Only on a subsequent edit (the edited image already shows them) may the oldest earlier accepted choices be omitted, newest kept; otherwise an oversized request fails before upload.
- Studio product integrations use a clean product photo as the fidelity source before a worn/in-scene product photo, because placement context must not redefine the product.

- The content-ideas selection develops each ranked candidate in its own parallel model call (reserves replace failures or duplicates once), because one sequential call for all ideas was the main wait.
- deno.json uses "nodeModulesDir": "manual" (never "auto"), because concurrent deno checks raced creating node_modules/.deno symlinks ("File exists os error 17") and broke the preview build; after adding an npm dependency, run `deno install` once to materialize links.

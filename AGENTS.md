# Architecture decisions

- Studio image actions are described as clickable words in a chat sentence (no hidden menu, no "Créer un contenu" button in that section), so every action is explained in place.
- Higgsfield Marketing Studio prompts are fitted to the provider 5000-char limit by condensing only generic boilerplate; the current confirmed request is never cut. Only on a subsequent edit (the edited image already shows them) may the oldest earlier accepted choices be omitted, newest kept; otherwise an oversized request fails before upload.
- Studio product integrations use a clean product photo as the fidelity source before a worn/in-scene product photo, because placement context must not redefine the product.

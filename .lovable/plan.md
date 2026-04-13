
Problème identifié : le state démo arrive bien jusqu’à `/creer`, mais l’UI ne l’affiche pas correctement.

Ce qui se passe
- Le bouton démo sauvegarde bien `AURIANA_DEMO_FLOW` avec `ideaText` et `demoScenario`.
- `CreerUnifie` restaure bien ce state.
- Mais l’étape Idée n’utilise pas `ideaText` restauré : `CreerStepIdea` garde un state local initialisé à `""`, donc le textarea reste vide.
- Ensuite, quand on clique “Suivant”, `handleIdeaNext` remet `selectedFormat`, `editorialAngle`, etc. à `null`, ce qui efface une partie du pré-remplissage de la démo.
- Il y a aussi un risque que l’étape Format ne reflète pas tout le scénario si certains choix ne sont pas persistés/restaurés.

Plan de correction
1. Pré-remplir réellement l’étape Idée
- Modifier `CreerStepIdea` pour accepter des props initiales (`initialIdea`, `initialObjective`) ou pour devenir contrôlé par le parent.
- Dans `CreerUnifie`, passer `ideaText` et `objective` restaurés à cette étape.
- Résultat : le sujet démo sera visible dès l’arrivée sur `/creer`.

2. Empêcher l’étape Idée d’effacer la démo
- Ajuster `handleIdeaNext` dans `CreerUnifie`.
- Si le flow démo Auriana est actif et que l’idée n’a pas changé, ne pas reset `selectedFormat`, `editorialAngle`, `carouselSubMode` et autres champs préchargés.
- Si l’utilisatrice modifie vraiment l’idée, alors on garde le reset normal.

3. Vérifier le pré-remplissage de l’étape Format
- Contrôler que `CreerStepFormat` reçoit bien les bonnes valeurs initiales pour le format et, si nécessaire, ajouter les props manquantes pour refléter aussi le sous-mode carrousel / angle éditorial.
- Objectif : que la démo montre bien l’étape suivante déjà préparée, sans saut ni perte d’état.

4. Conserver le comportement Questions / Résultat déjà prévu
- Garder l’injection des questions démo via `setQuestions`.
- Garder `initialAnswers={AURIANA_DEMO_FLOW.answers}`.
- Garder le bypass final dans `doGenerate` pour afficher le carrousel pré-calculé sans appel IA.

5. Vérification attendue après correction
- Clic sur “Lancer la démo carrousel”
- Arrivée sur `/creer` avec le sujet déjà visible dans le champ
- Clic “Suivant” → étape Format déjà cohérente avec la démo
- Clic “Suivant” → Questions pré-remplies
- Clic “Générer” → Résultat instantané, sans appel IA

Détail technique
- Cause racine principale : désynchronisation entre state restauré dans `CreerUnifie` et state local interne dans `CreerStepIdea`.
- Cause secondaire : `handleIdeaNext` réinitialise trop agressivement des données qui devraient être conservées pour un scénario démo verrouillé.
- Correctif minimal attendu :
  - `src/components/creer/CreerStepIdea.tsx`
  - `src/pages/CreerUnifie.tsx`
  - potentiellement `src/components/creer/CreerStepFormat.tsx` si on veut refléter aussi tous les choix préchargés visuellement

## Ce que j’ai trouvé

- Le backend hébergé a l’air sain.
- La fonction `newsjacking-angles` existe bien, mais je n’ai trouvé aucun log récent côté exécution, donc le problème n’est pas confirmé comme étant uniquement “la fonction plante”.
- Dans l’UI, le clic sur **Voir les angles** déclenche un appel bloquant unique avec un timeout client à **100 s** et un timeout serveur à **90 s**.
- Pendant ce temps, l’interface n’affiche qu’un spinner générique dans la carte, sans distinguer :
  - appel jamais parti,
  - session expirée,
  - réseau instable,
  - IA lente,
  - timeout réel.
- Le replay montre aussi une **perte de connexion** pendant la session, ce qui peut expliquer une partie du “ça tourne dans le vide”.
- En l’état, même quand le système “travaille”, l’expérience ressemble à un blocage parce qu’il n’y a ni progression, ni état intermédiaire, ni signal clair d’erreur.

## Plan

1. **Instrumenter précisément le clic “Voir les angles” côté frontend**
   - Ajouter des logs/états locaux pour savoir si le clic part bien, quand l’appel démarre, quand il finit, et quel type d’erreur remonte.
   - Distinguer explicitement les cas `timeout`, `auth`, `network`, `server` dans l’UI de la carte.

2. **Rendre l’attente compréhensible côté interface**
   - Remplacer le spinner muet par un état de progression plus explicite : démarrage, génération en cours, attente anormalement longue.
   - Afficher un message d’escalade après quelques secondes (“ça prend plus de temps que prévu”) au lieu de laisser penser que rien ne se passe.

3. **Sécuriser le flux d’appel**
   - Vérifier que `fetchAngles()` ne reste jamais coincé en état `loading` si l’appel échoue tôt ou si la session est invalide.
   - Ajouter une gestion plus nette du retry pour éviter les états ambigus après un premier échec.

4. **Valider si l’architecture synchrone est encore adaptée**
   - Si les temps réels restent trop longs, basculer ensuite vers un modèle asynchrone : création d’un job, réponse immédiate, puis polling du statut.
   - Ça éviterait totalement l’effet “tourne dans le vide” sur les générations lentes.

## Détails techniques

- Fichiers ciblés :
  - `src/components/creer/NewsjackingPanel.tsx`
  - `src/lib/invoke-with-timeout.ts`
  - possiblement `supabase/functions/newsjacking-angles/index.ts`
- Je commencerai par corriger l’observabilité et l’UX d’attente avant de décider s’il faut aller jusqu’à une file de jobs.
- Si les mesures montrent que le backend répond en moins de 30–40 s mais que l’UI semble figée, la priorité sera frontend.
- Si les mesures montrent des temps trop longs ou irréguliers, la bonne solution sera un flux asynchrone avec statut persisté.
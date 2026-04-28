## Objectif

Réduire le temps perçu d'attente dans le Coach contenu en n'affichant au départ que l'essentiel des 3 idées (hook + angle court). Les détails (sujet long, brief, "pourquoi ça marche") s'ouvrent uniquement quand l'utilisatrice clique sur une idée — sans nouvelle génération IA.

## Principe retenu

3 idées allégées, détail inline sous la carte sélectionnée, **une seule génération** côté serveur (on évite un deuxième appel IA pour ne pas re-payer en latence).

## Changements UI dans `ContentCoachingDialog.tsx`

État de chargement (étape "loading") :
- Skeleton plus compact : 3 lignes courtes au lieu des 3 cartes hautes actuelles.
- Réduire la hauteur du dialog pendant le loading (moins de "ça défile dans le vide").
- Garder le `LoadingMessage` rotatif mais raccourcir les messages.

Étape "result" (`step === "result"`) avec idées :
- Carte fermée par défaut : afficher uniquement
  - le hook (« … »),
  - le tag d'angle (badge),
  - le tag d'objectif.
- **Masquer par défaut** : `idea.subject` (le résumé long sous le hook), `idea.brief`, `idea.why_it_works`.
- Au clic sur une carte (`setSelectedIdea`), révéler en dessous, dans la même carte, un bloc dépliant :
  - `subject` (en label "Sujet")
  - `brief`
  - `why_it_works` (en italique discret)
- Animation `animate-fade-in` déjà utilisée → réutiliser pour la zone dépliée.
- Un seul élément ouvert à la fois (déjà géré par `selectedIdea`).
- Le bouton « C'est parti, on crée ! » reste désactivé tant qu'aucune idée n'est sélectionnée (comportement actuel conservé).

Bloc "Format recommandé" :
- Le replier sous un petit toggle "Pourquoi ce format ?" pour alléger la vue (optionnel mais cohérent avec la demande).

## Ce qui ne change PAS

- L'edge function `content-coaching` reste inchangée : elle renvoie déjà tout en un appel. On exploite simplement mieux la donnée côté front (chargement progressif visuel, pas progressif réseau).
- Pas de nouvel appel IA au clic — pour éviter d'allonger le temps total et la consommation de quota.
- Aucune logique métier modifiée : `handleGo`, redirection, `onSelect`, sous-mode carrousel, surprise — tout reste identique.

## Fichiers touchés

- `src/components/dashboard/ContentCoachingDialog.tsx` (UI uniquement)

## Vérif après implémentation

- Lancer le coach, vérifier que la vue résultat affiche 3 cartes compactes.
- Cliquer sur une idée → le brief apparaît inline, fade-in fluide.
- Re-cliquer → la carte se referme.
- Cliquer sur « C'est parti » → même redirection qu'avant.

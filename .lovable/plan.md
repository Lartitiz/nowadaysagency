# « Il y a déjà un contenu en cours » — demander avant d'écraser

## Le problème (confirmé dans le code)

Quand tu cliques « ✍️ Ré-angler » (ou tout autre raccourci qui envoie un sujet sans paramètres d'URL), la page /creer :

1. restaure ton brouillon en cours (le contenu déjà généré) ;
2. et **ignore complètement** la nouvelle demande — l'init s'arrête net dès qu'un brouillon existe (`if (ps && !hasUrlParams) return`).

Résultat vécu : tu retombes sur l'ancien post et le nouveau ne démarre jamais. Le même piège existe pour d'autres entrées qui passent par « state » sans paramètres d'URL (recyclage, « créer depuis cette actu », brief, coach).

## Ce qu'on fait

Un **garde-fou générique** : si une nouvelle intention de création arrive alors qu'un brouillon est en cours, on demande au lieu de choisir à ta place.

Petite fenêtre :

> **Tu as déjà un contenu en cours**
> « [thème du brouillon] » — étape : rédaction
>
> - **Reprendre mon contenu en cours** (on ignore la nouvelle demande)
> - **Démarrer le nouveau** « [nouveau sujet] » (le brouillon en cours est abandonné)
> - Note : « Enregistre-le dans mes idées avant » — case à cocher sur l'option « Démarrer le nouveau », pour ne rien perdre.

Rien ne se lance tant que tu n'as pas choisi. Si aucun brouillon n'existe (ou s'il est vide / à l'étape « idée »), rien ne change : la nouvelle création part directement comme aujourd'hui.

## Détails techniques

- `src/pages/CreerUnifie.tsx` : détecter le conflit à l'init — nouvelle intention (`locState.sujet/subject/context/fromRecycle/fromBrief` ou params `?sujet/?format`) **et** brouillon significatif (`existingFlowState.step !== "idea"` avec du contenu). Dans ce cas : ne pas restaurer ni initialiser, stocker l'intention dans un ref et ouvrir la modale.
- Nouveau composant `src/components/creer/DraftConflictDialog.tsx` (résumé du brouillon, résumé de la nouvelle demande, 2 actions + case « sauver dans mes idées »).
- Choix « reprendre » : on restaure le brouillon comme aujourd'hui et on jette l'intention.
- Choix « démarrer le nouveau » : `clearFlowState()` (+ sauvegarde optionnelle dans `saved_ideas` via le flux d'enregistrement existant), puis on rejoue l'init avec l'intention mémorisée.
- Aucun changement des edge functions, du schéma ou des crédits.

# Studio visuel : une seule liste de photos de référence

## Problème

Les photos de référence apparaissent à deux endroits qui se ressemblent :

1. **Le panneau latéral** (bouton « Références · N » dans la barre d'outils) : liste « Photos de référence » avec rôle et bouton retirer.
2. **L'accordéon « Photos de cette demande »** juste au-dessus du champ de saisie : les mêmes photos avec leurs rôles.

Doublon déroutant : on ne sait pas lequel utiliser.

## Solution

Garder **un seul endroit** : l'accordéon au-dessus du champ de saisie, là où on écrit sa demande.

- L'accordéon affiche **toutes** les photos de référence de la session (pas seulement celles de la demande en cours), avec pour chacune : son rôle, la possibilité de l'inclure ou non dans la demande, et de la retirer. Il est renommé **« Photos de référence (N) »**.
- Le panneau latéral **ne liste plus les photos**. Il garde uniquement ce qui n'existe nulle part ailleurs : les photos proposées par l'assistant, les références de la charte, les compositions enregistrées, et les outils Avant/après et Mockup.
- Le bouton de la barre d'outils redevient **« Outils et créations »** (puisqu'il n'ouvre plus de liste de photos).

Rien ne change côté serveur : mêmes rôles, mêmes règles d'envoi, même limite de 8 photos. Aucune génération n'est déclenchée par ce changement.

## Détails techniques

- `src/pages/VisualStudioPage.tsx` :
  - Accordéon : passer `references` (toutes) au lieu de `attachedReferences`, renommer le titre, garder `ReferenceCards` avec `onSelection` (inclure/exclure de la demande), `onRole`, `onGroup`.
  - Panneau latéral (`Sheet`) : supprimer le bloc « Photos de référence » (liste, sélecteurs de rôle, boutons retirer, textes d'aide associés) ; conserver photos proposées, charte, compositions, Avant/après, Mockup.
  - Bouton toolbar : libellé fixe « Outils et créations ».
- Vérifier que `ReferenceCards` gère l'état « non incluse dans cette demande » (via `onSelection`) ; ajuster si besoin.
- Tests : adapter/ajouter les tests Vitest du Studio (libellés, accordéon unique, panneau sans liste de photos), lancer les tests Studio ciblés + `tsc --noEmit -p tsconfig.app.json`.

## Hors périmètre

- Pas de changement de comportement serveur, de quotas, ni de la question « références changées ».
- Pas de publication : mise en ligne uniquement sur demande explicite.

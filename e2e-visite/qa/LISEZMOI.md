# Tests de vérification des stories (lancés à la main)

Écrits le 12/11/2026 pour le chantier « stories comme le carrousel » (#1866, #1884, #1893).
Ils tournent sur le compte test Camille, **jamais** dans la visite du matin
(`playwright.visite.config.ts` les écarte tant que `VISITE_QA` n'est pas posé).

| Fichier | Ce qu'il vérifie | Coût |
|---|---|---|
| `qa-stories-edition.spec.ts` | retouche d'une story, enregistrement auto, historique | 0 crédit |
| `qa-stories-sauvegarde.spec.ts` | génère une séquence, la retrouve dans Mes idées dans un nouvel onglet | **1 crédit** |
| `qa-stories-calendrier.spec.ts` | « Garder au calendrier », « Modifier les stories », mise à jour du calendrier | 0 crédit, **écrit au calendrier de Camille** |
| `qa-stories-mobile.spec.ts` | premier écran téléphone : position de l'aperçu, débordement | 0 crédit |

`QA_STAMP` = le numéro écrit dans la séquence de test (pour la retrouver dans Mes idées).
Les tests calendrier et téléphone ont besoin d'une séquence déjà créée par `qa-stories-sauvegarde`.

```bash
VISITE_QA=1 QA_STAMP=12345 npx playwright test -c playwright.visite.config.ts e2e-visite/qa/qa-stories-mobile.spec.ts --project=mobile
```

Pour viser un serveur local : `VISITE_BASE_URL=http://localhost:8091`.
Après usage, supprimer la séquence de test de Mes idées et du calendrier de Camille.
Les captures vont dans `e2e-visite/qa/shots/` (non suivi par git).

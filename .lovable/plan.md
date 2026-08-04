# Redéploiement de 3 edge functions (PR #692)

Aucun code modifié, aucune migration SQL. Uniquement un redéploiement du code déjà présent sur `main`.

## Fonctions à redéployer

- `reel-render` — nouvelle action `archive` (recopie du MP4 rendu dans le bucket `calendar-media`)
- `social-instagram-publish` — publication vidéo (`media_type=REELS`)
- `social-publish-scheduled` — reconnaissance vidéo dans `media_urls`, et surtout embarque la nouvelle version de `_shared/instagram-graph.ts` (`publishReelToInstagram`), qui ne se propage pas toute seule

## Détails techniques

Un seul appel à l'outil de déploiement Supabase avec ces trois noms. Le bundle de chaque fonction inclut ses imports `_shared/`, donc le redéploiement explicite de `social-publish-scheduled` suffit à propager `instagram-graph.ts`.

Ensuite : confirmation de l'heure de déploiement pour chacune.

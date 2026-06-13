# Plan — Nettoyer les redirections legacy mortes du routing branding (App.tsx)

## Contexte métier

Le routing `/branding/*` dans App.tsx a accumulé des redirections d'anciennes URLs vers la nouvelle structure unifiée `/branding/section?section=X`. Un audit a confirmé que 14 de ces redirections sont totalement mortes : AUCUN composant, hook, navigate(), Link, email ou edge function n'y pointe plus. Ce sont des lignes inertes à retirer pour alléger le routing.

## Fichier impacté

- `src/App.tsx` (uniquement les `<Route>` listées ci-dessous)

## Changements à apporter

Supprimer EXACTEMENT ces 14 lignes de `<Route>` (redirections `Navigate` mortes) :

```text
<Route path="/branding/ton" element={<Navigate to="/branding/section?section=tone_style" replace />} />
<Route path="/branding/ton/recap" element={<Navigate to="/branding/section?section=tone_style&tab=synthese" replace />} />
<Route path="/branding/storytelling" element={<Navigate to="/branding/section?section=story" replace />} />
<Route path="/branding/storytelling/new" element={<Navigate to="/branding/coaching?section=story" replace />} />
<Route path="/branding/storytelling/import" element={<Navigate to="/branding/section?section=story" replace />} />
<Route path="/branding/storytelling/:id" element={<Navigate to="/branding/section?section=story" replace />} />
<Route path="/branding/storytelling/:id/recap" element={<Navigate to="/branding/section?section=story&tab=synthese" replace />} />
<Route path="/branding/storytelling/recap" element={<Navigate to="/branding/section?section=story&tab=synthese" replace />} />
<Route path="/branding/niche" element={<Navigate to="/branding/section?section=tone_style" replace />} />
<Route path="/branding/niche/recap" element={<Navigate to="/branding/section?section=tone_style" replace />} />
<Route path="/branding/strategie" element={<Navigate to="/branding/section?section=content_strategy" replace />} />
<Route path="/branding/strategie/recap" element={<Navigate to="/branding/section?section=content_strategy&tab=synthese" replace />} />
<Route path="/branding/persona" element={<Navigate to="/branding/section?section=persona" replace />} />
<Route path="/branding/persona/recap" element={<Navigate to="/branding/section?section=persona&tab=synthese" replace />} />
```

## Ce qui NE DOIT PAS bouger — CRITIQUE

Garder INTACTES ces routes (ce sont de vraies pages OU des redirections encore référencées) :

- `<Route path="/branding/storytelling/:id/edit" ... StorytellingEditPage />` — vraie page, 3 composants y naviguent. NE PAS SUPPRIMER.
- `<Route path="/branding/proposition" element={<Navigate to="/branding/proposition/recap" replace />} />` — encore utile, sert la page recap. GARDER.
- `<Route path="/branding/proposition/recap" ... PropositionRecapPage />` — vraie page, référencée par 10+ endroits. GARDER.
- Toutes les autres routes `/branding` (`/`, `/audit`, `/audit/:id`, `/offres`, `/offres/:id`, `/coaching`, `/section`, `/voice-guide`, `/charter`) — GARDER.
- NE PAS toucher à l'import de `Navigate` en haut du fichier (encore utilisé par la redirection `/branding/proposition`).
- NE PAS toucher à `src/lib/breadcrumb-config.ts` (l'entrée `/branding/storytelling/` sert encore la page edit).
- NE rien changer d'autre dans App.tsx (imports, autres modules, ProtectedRoute, PUBLIC_PATHS).

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur.
2. `grep -n 'path="/branding' src/App.tsx` ne montre plus AUCUNE des 14 routes supprimées, mais montre toujours : `/branding`, `/branding/audit`, `/branding/audit/:id`, `/branding/storytelling/:id/edit`, `/branding/proposition`, `/branding/proposition/recap`, `/branding/offres(/:id)`, `/branding/coaching`, `/branding/section`, `/branding/voice-guide`, `/branding/charter`.
3. Test manuel : naviguer dans l'espace branding (sections, coaching, édition story, proposition de valeur) — tout fonctionne, aucune page blanche.

## Hors scope (plans séparés)

- Refacto langage neutre "l'utilisatrice" dans les Edge Functions.
- Toute modification des composants qui naviguent (ils pointent déjà vers les bonnes URLs `/branding/section` et `/branding/coaching`).
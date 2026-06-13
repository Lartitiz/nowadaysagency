# Plan — Corriger chevauchement titre/numéro et étirement des colonnes

## Fichier impacté
`supabase/functions/carousel-visual/index.ts` — UNIQUEMENT le prompt système.
Aucune modification du flux IA (appel Claude, parsing, post-processing), des annotations `data-pptx-*`, des placeholders `{{PHOTO_N}}`, du quota ou du frontend.

## Changement 1 — Zone de sécurité titre vs badge numéro

Dans la section `═══ COHÉRENCE ET CONTINUITÉ VISUELLE ═══` (l.759-766), juste après la ligne 762 qui décrit le badge numéro de slide, ajouter une règle dédiée :

> ZONE DE SÉCURITÉ TITRE / NUMÉRO (impératif) :
> - Le badge numéro de slide est positionné en absolu dans un coin (top/right ou bottom/right), AU-DESSUS du flux normal (z-index supérieur).
> - Le titre principal ne doit JAMAIS chevaucher ce badge. Deux options autorisées (au choix selon le layout) :
>   · Soit le titre est placé SOUS la ligne du badge (le badge a son propre espace en haut, suivi d'un margin-top sur le titre ≥ hauteur du badge + 16px).
>   · Soit le titre partage la ligne du haut MAIS son conteneur a `max-width: 78%` (ou `padding-right` ≥ largeur du badge + 24px) pour réserver la zone du badge.
> - Cette règle s'applique à TOUS les types de slide (text_only, photo_integrated, photo_full), schémas inclus.

Cette règle est posée au niveau "cohérence" car elle est transverse à tous les layouts, pas spécifique à un schéma.

## Changement 2 — Cartes à colonnes : hauteur proportionnée

Reformuler la règle `CARTES SŒURS = MÊME HAUTEUR` (l.182) pour distinguer clairement deux niveaux : la rangée vs la slide.

Remplacement de la ligne 182 par :

> - CARTES SŒURS = MÊME HAUTEUR ENTRE ELLES, PAS PLEINE SLIDE : dans un schéma à cartes multiples côte à côte (before_after, comparison, process_visible, et toute rangée de cartes sœurs), les cartes d'une même rangée ont la MÊME hauteur entre elles (le conteneur flex de la rangée garde `align-items:stretch`, jamais `center` ou `flex-start`) ET le MÊME alignement vertical de leur contenu interne. EN REVANCHE, la rangée ne doit PAS être étirée pour remplir toute la hauteur de la slide : le wrapper de niveau slide centre la rangée verticalement (`display:flex; align-items:center; justify-content:center`) et laisse la rangée se dimensionner sur son contenu. La hauteur d'une carte est dictée par son contenu (avec un padding intérieur confortable) — JAMAIS par `height:100%` de la slide. Si le contenu est court, les cartes restent compactes et la slide montre de l'air autour, c'est volontaire.

Aucune autre ligne du prompt ne change ; les templates HTML inline (`flex:1` sur les cartes d'une rangée, `align-items:stretch` sur la rangée elle-même) restent intacts puisqu'ils respectent déjà la règle reformulée — seul le wrapper de niveau slide doit éviter d'étirer la rangée.

## Propositions hors demande (à valider séparément, non incluses dans l'exec)

(b1) Préciser dans le bloc `═══ ANTI-PATTERNS ═══` deux entrées miroirs :
- "❌ Titre qui passe sous le badge numéro de slide"
- "❌ Cartes étirées sur 100% de la hauteur de la slide avec contenu court"

(b2) Mentionner une hauteur de carte indicative max (ex: 60-70% de la slide) pour ancrer le "compact si contenu court". Plus prescriptif, à manier avec précaution car risque de régression sur cartes avec contenu long.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe (changement = chaînes de caractères uniquement, aucun impact type-checker attendu).
- `rg "ZONE DE SÉCURITÉ TITRE" supabase/functions/carousel-visual/index.ts` → 1 occurrence.
- `rg "PAS PLEINE SLIDE" supabase/functions/carousel-visual/index.ts` → 1 occurrence.
- Régénération manuelle : 1 carrousel avec titre long, 1 avec `before_after`, 1 avec `comparison` → aucun chevauchement titre/badge, cartes proportionnées au contenu.
- Aucune régression sur `story_arc`, `timeline`, `pyramid`, `process_visible`, `equation`, slides photo_full / photo_integrated.

## Hors scope

- export-carousel-hybrid-pptx.ts (inchangé)
- Éditabilité PPTX (plan B distinct)
- Contenu éditorial / prompts copywriting

# Plan — Carrousel photo : intégrer le contexte actu dans la proposition de structure

## Contexte

Dans `supabase/functions/carousel-ai/index.ts`, le `newsContextBlock` est construit (ligne 165) et injecté dans `systemPrompt` global (ligne 169). Mais le bloc `type === "structure_proposal"` (lignes 315-491) reconstruit son propre `structureSystemPrompt` from scratch (ligne 389) — qui ne reçoit jamais le contexte actualité. Résultat : en mode photo + newsjacking, le squelette narratif des slides ignore totalement l'article.

## Fichier modifié

- `supabase/functions/carousel-ai/index.ts` (bloc `structure_proposal` uniquement)

## Modifications détaillées

### 1. Injecter newsContextBlock dans structureSystemPrompt (conditionné)

Dans le bloc `structure_proposal`, après la déclaration de `structureSystemPrompt` (ligne 389), ajouter :

```typescript
const structureNewsContextBlock = (typeof newsContext === "string" && newsContext.trim().length > 0)
  ? newsContextBlock  // réutilise la variable déjà construite ligne 165
  : "";
```

Modifier `structureSystemPrompt` pour insérer `structureNewsContextBlock` après le bloc CONTEXTE BRANDING (ligne 405-406), avec une consigne spécifique structure :

```text
CONTEXTE BRANDING :
${brandingContext}

${structureNewsContextBlock}

CONSIGNE STRUCTURE — NEWSJACKING ACTIF :
- La slide 1 (hook) DOIT partir de l'actualité ci-dessus.
- Au moins une slide de corps doit exploiter un fait précis de l'actu (chiffre, nom, citation, mécanisme).
- Les photos illustrent et incarnent ce propos ; elles ne le remplacent pas.
```

L'insertion est conditionnée : si `newsContext` est absent ou vide, `structureNewsContextBlock` vaut `""`, la consigne disparaît, et le prompt est strictement identique à aujourd'hui.

### 2. Enrichir structureUserPrompt avec un rappel actu

Dans `structureUserPrompt` (lignes 434-440), ajouter une ligne conditionnée juste après le sujet :

```typescript
${typeof newsContext === "string" && newsContext.trim().length > 0
  ? `Actualité de référence : "${newsContext.split("\n")[0]?.slice(0, 120)}…" — cette actu doit ancrer la structure proposée.`
  : ""}
```

Cela rappelle au modèle, au milieu de l'analyse photo, qu'une actu de référence existe et doit structurer le squelette. Le titre est extrait de la première ligne de `newsContext` (tronquée à 120 caractères) pour rester concis.

## Ce qui reste inchangé (garanti)

- `photoInstruction`, `slideTarget`, `SLIDE_TITLE_RULES` : aucun changement.
- La structure JSON de sortie (`narrative_thread`, `story_beat`, `visual_anchor`, `photo_index`, etc.) : inchangée.
- `pushPhotoWithContext`, ordre des photos, analyse visuelle : inchangée.
- Les branches `express_full`, `hooks`, `slides`, `mix`, `suggest_*`, `deepening_questions` : non touchées.
- `max_tokens: 3000` pour `structure_proposal` : conservé (pas de risque de troncation avéré : on ajoute ~300 tokens de consigne conditionnée, soit <10% du budget, et seulement quand newsContext est présent).

## Proposition optionnelle (b) à valider individuellement

1. **Appliquer la même injection à `structure_proposal` en mode mix** (`carousel_type === "mix"`) quand `newsContext` est présent. Aujourd'hui le mode mix a déjà un prompt news dans `buildMixCarouselNewsReactionPrompt` pour l'écriture, mais PAS pour la proposition de structure. Si validé, la consigne s'appliquerait aussi au mix. Si refusé, le mix reste en l'état (hors scope). (Validé ? Oui / Non) oui

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- Test manuel : actu + carrousel photo → l'écran `structure_review` montre une slide 1 ancrée sur l'actu et au moins une slide de corps liée à l'article, pas seulement une description des photos.
- Régression : carrousel photo SANS actu → structure identique à avant (pas de mention actu dans les prompts, comportement inchangé).
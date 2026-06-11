# Plan validé — Newsletter 2-step + correction pass dans creative-flow

## Fichier impacté

`supabase/functions/creative-flow/index.ts` uniquement.

## (a) Ce que tu as demandé

### 1. Schéma JSON enrichi pour newsletter (autour de la ligne 588)

Remplacer le ternaire actuel :

```ts
${isReel || isStories ? `` : `Réponds UNIQUEMENT en JSON :
{ "content": "...", "accroche": "...", "format": "...", "pillar": "...", "objectif": "..." }`}
```

par une variante imbriquée :

- `isReel || isStories` → pas de JSON (inchangé)
- `isNewsletter` → schéma enrichi :
  ```json
  {
    "subject": "objet de l'email (max 50 caractères, accrocheur, jamais 'Newsletter #N')",
    "preview_text": "texte de preview (40-90 caractères, complète l'objet sans le répéter)",
    "content": "corps complet de la newsletter (avec \\n\\n entre paragraphes)",
    "accroche": "première phrase du corps",
    "cta_suggestion": "suggestion de CTA doux si pertinent, sinon null",
    "format": "newsletter",
    "pillar": "...",
    "objectif": "..."
  }
  ```
  Le champ reste `content` (pas `body`) pour la compat frontend.
- sinon → schéma actuel (`content/accroche/format/pillar/objectif`) inchangé.

### 2. Branche dispatch newsletter (juste après le bloc `if (isLinkedIn)` ligne 958, avant le retour vers le streaming générique)

Ajouter `if (isNewsletter) { ... }` calqué sur LinkedIn :

a. `const rawContent = await callAnthropicSimple(model, systemPrompt, userPrompt!, 0.7, 4096);` (température 0.7 conformément à ta spec, vs 0.85 LinkedIn).

b. Parse JSON tolérant :

- `JSON.parse(rawContent)` direct,
- sinon `rawContent.match(/\{[\s\S]*\}/)` puis `JSON.parse`,
- sinon fallback `{ content: rawContent }`.

c. Correction pass si `parsed.content && parsed.content.length >= 200` :

   Jamais de throw qui remonterait à la requête.

d. `parsed.word_count = parsed.content.split(/\s+/).filter(Boolean).length;` (si `parsed.content` existe).

e. `await logUsage(userId, "content", "creative_flow", undefined, undefined, workspace_id);`

f. `return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });`

### 3. Aucune modification frontend.

## Ce qui ne bouge pas

Bloc LinkedIn (958+), bloc Carousel, streaming vision LinkedIn photo (`canStreamPhoto`), streaming des autres formats texte (post IG, Pinterest), steps `adjust/recycle/angles/questions`, `runPipeline`, quotas, `newsletterBrief()`, `_shared/correction-pass.ts`, fonction `newsletter-ai`, injection contexte série newsletter.

## (b) Propositions optionnelles (à valider une par une avant exec — non incluses par défaut)

1. **Extraire le `jsonShape` newsletter dans une const en haut du bloc `generate**`, comme c'est fait pour le bloc photo (ligne 941 utilise déjà `${jsonShape}`). Aujourd'hui le schéma serait inline dans le template du systemPrompt, ce qui rend le diff lourd. Une const `newsletterJsonShape` au-dessus rendrait la lecture plus claire. **Risque** : sort légèrement du périmètre "corps du ternaire ligne 588". À valider. non
2. **Logger la longueur de `parsed.subject` et `parsed.preview_text**` dans la branche newsletter (`console.log("[creative-flow newsletter] subject:", parsed.subject?.length, "preview:", parsed.preview_text?.length)`) pour faciliter le debug si Claude ignore les contraintes de longueur. Purement observabilité, zéro effet runtime. ok
3. **Garde-fous de longueur côté serveur** (tronquer `subject` à 50 et `preview_text` à 90 si dépassement) — utile mais c'est un choix produit (préfères-tu re-prompter, tronquer, ou laisser passer ?). À discuter, **pas** dans ce plan.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` clean.
- Génération newsletter depuis Créer : `subject` et `preview_text` présents dans la réponse JSON, cartes dédiées affichées par le renderer existant.
- Post Instagram : streaming SSE inchangé. Post LinkedIn : JSON corrigé inchangé.
- Logs edge : `[creative-flow newsletter] correction pass…` visible.
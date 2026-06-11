# Plan — Robustesse `newsjacking-ai` (timeout, doublons, owner)

Périmètre : 2 fichiers backend uniquement. Aucun frontend, aucun changement de contrat client.

## (a) Ce que tu m'as demandé

### 1. Budget timeout cascadé — `supabase/functions/newsjacking-ai/index.ts`

- Au tout début du handler `Deno.serve` (juste après le `try`), ajouter :
  ```ts
  const t0 = Date.now();
  ```
- Ligne ~596, remplacer :
  ```ts
  const timeout = setTimeout(() => controller.abort(), 170000);
  ```
  par :
  ```ts
  const remainingBudget = Math.max(60_000, 170_000 - (Date.now() - t0));
  const timeout = setTimeout(() => controller.abort(), remainingBudget);
  ```
- Garantit que la fonction se termine (succès ou abort) avant le timeout frontend de 180s — plus de crédit consommé sur résultat non délivré.

### 2. Exclusion des actus déjà vues dans le prompt Claude

- `excludedUrls` est déjà parsé ligne ~139 (max 50).
- Ligne ~609, avant la concaténation `+ "\n\nFais les recherches maintenant…"`, construire un bloc additionnel uniquement si `excludedUrls.length > 0` :
  ```ts
  const exclusionBlock = excludedUrls.length > 0
    ? `\n\nSUJETS DÉJÀ PROPOSÉS À L'UTILISATRICE — ne reprends AUCUNE de ces sources, ni le même sujet reformulé depuis une autre source :\n` +
      excludedUrls.map(u => `- ${u}`).join("\n")
    : "";
  ```
- Insérer `exclusionBlock` dans le `content` du message user (avant le paragraphe "Fais les recherches maintenant…").
- Si vide : message strictement identique à aujourd'hui.

### 3. Owner via `getUserContext` (2 fichiers, couplés)

**`supabase/functions/_shared/user-context.ts`** — additif uniquement :
- Dans le `return` ligne ~110, ajouter en première clé :
  ```ts
  return {
    profileUserId,
    storytelling: stRes.data,
    ...
  };
  ```
- Aucune autre modification (formatContextForAI, presets, requêtes, types existants : inchangés).

**`supabase/functions/newsjacking-ai/index.ts`** :
- Supprimer le bloc lignes ~188-198 (résolution `bpUserId` via `workspace_members`).
- Le remplacer par une seule ligne :
  ```ts
  const bpUserId = (ctx as any).profileUserId ?? user.id;
  ```
  (`ctx` est déjà disponible depuis ligne ~166.)

## (b) Propositions d'amélioration — à valider avant exec

Aucune. Le périmètre est net et les 3 changements sont chirurgicaux. Je propose de m'en tenir strictement à la demande ; les chantiers connexes (titres en plus des URLs, pré-calcul angles, 403 démo) sont déjà identifiés comme hors scope.

## Ce qui ne bouge pas

- Ordre `checkQuota` → IA → `logUsage`
- Contenu du `systemPrompt` (garde-fous, registres, force_pont) hors injection du bloc exclusion
- `_shared/perplexity.ts` et son appel
- Stratégies de parsing JSON et filtrage EVERGREEN
- Cache univers de marque (TTL 30j) et régénération
- Rate limit, guard mode démo
- Reste de `user-context.ts` (presets, formatContextForAI, requêtes)
- Toutes les autres Edge Functions consommant `getUserContext` (ajout d'un champ au return = non-breaking)
- Aucun fichier frontend

## Critères de validation

1. `npx tsc --noEmit --skipLibCheck` passe sans erreur
2. Recherche scoop : réponse < 180s, ou abort propre côté Claude avant la limite, sans crédit consommé
3. "Relancer" 2× : aucune URL de la liste précédente ne réapparaît
4. Workspace partagé (CM) : univers de marque = celui du owner (comportement identique à avant)
5. Autres consommateurs de `getUserContext` : compilent et fonctionnent à l'identique

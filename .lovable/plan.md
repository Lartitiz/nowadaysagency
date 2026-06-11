## Plan — Bouton "🔄 autre angle" par carte d'idée (Coach contenu)

### Fichier modifié

`src/components/dashboard/ContentCoachingDialog.tsx` uniquement. Backend non touché : `regenerate_lens` est déjà câblé dans `supabase/functions/content-coaching/index.ts` (param lu ligne 57, prompt ligne 467, `logUsage("suggestion", …)` ligne 522 → le quota est bien décompté par le même chemin que `generateIdeas`).

### Forme de la réponse en mode `regenerate_lens` (vérifié en lecture)

Le back renvoie le MÊME shape `{ ideas: [...], recommended_format, … }` avec `ideas` contenant **1 seul objet idée** (et un fallback compat qui remplit `recommended_subject` depuis `ideas[0]`, qu'on ignore côté front). On lira donc `data.ideas[0]` et on remplacera l'idée à l'index ciblé.

### (a) Demandé — implémentation

1. **Nouveau state local** dans le composant :
  - `regeneratingIdx: number | null` — index de la carte en cours de régénération (null sinon). Permet le spinner local et de désactiver le bouton sur cette carte uniquement.
2. **Nouveau handler `regenerateLens(idx, idea, e)**` :
  - `e.stopPropagation()` pour ne pas déclencher le `onClick` parent (sélection de la carte).
  - Garde : si `!idea.lens` → ne rien faire (bouton déjà désactivé côté UI).
  - `setRegeneratingIdx(idx)`.
  - Snapshot de l'idée précédente (`prevIdea = result.ideas[idx]`).
  - Appel `invokeWithTimeout("content-coaching", { body: { answers: { objectif, sujet: sujet || null, canal, format, content_type: "auto", ton_envie: "auto" }, workspace_id: workspaceId !== user?.id ? workspaceId : undefined, regenerate_lens: idea.lens } }, 120000)` — strictement le même pattern que `generateIdeas` + `regenerate_lens`. Pas de `intensity` (on ne propage pas le bold global pour éviter les effets de bord ; le back est déjà "plus radical" en mode regenerate_lens).
  - Succès : extraire `newIdea = data?.ideas?.[0]`. Si absent → throw.
  - Remplacement immutable dans `result.ideas` à l'index `idx`, en préservant tout le reste de `result` :
    ```
    setResult(prev => prev ? { ...prev, ideas: prev.ideas!.map((it, i) => i === idx ? newIdea : it) } : prev);
    ```
  - Nettoyage par-carte : si `selectedIdea === prevIdea` → `setSelectedIdea(null)` ; si `savedIdeas.has(idx)` → retirer `idx` du Set (la nouvelle idée n'est ni sélectionnée ni sauvegardée).
  - Échec/timeout : `toast.error(...)` (même message pattern que `generateIdeas`), on NE touche pas à `result` (la carte reste sur `prevIdea` intacte).
  - `finally` : `setRegeneratingIdx(null)`.
3. **UI — petit bouton discret sur chaque carte** (dans la `flex items-center gap-2 mt-2 flex-wrap` autour de la ligne 490, à côté du span Sauvegarder ligne 506-528) :
  - Même style "pill discrète" que Sauvegarder (`rounded-full border px-2 py-0.5 text-[10px] font-medium`), via `role="button"` + `stopPropagation` pour ne pas activer la sélection de la carte.
  - Label : `🔄 autre angle` (avec `RefreshCw` lucide en `h-3 w-3` pour cohérence ; emoji ok mais icône plus propre — à confirmer, je peux garder l'emoji du brief).
  - Disabled si `!idea.lens` (cas dégradé) ou si `regeneratingIdx !== null` (évite les appels concurrents sur plusieurs cartes).
  - Si `regeneratingIdx === i` : afficher `Loader2` qui spin à la place de l'icône + texte "régénération…", et **overlay léger** sur la carte (`opacity-60 pointer-events-none` sur le contenu texte, sauf le bouton lui-même) pour signaler l'état sans masquer les 3 autres cartes.
  - Aucun `setStep("loading")` — l'écran loading plein reste réservé à `generateIdeas`.
4. **Ce qui ne bouge pas** : boutons globaux "Autres idées" / "Pousse plus loin" / "C'est parti", handlers `handleGo` / `handleSaveIdea` / `handleSelectAlternative` / `handleFormatSelect` / `handleCarouselSubSelect`, branche "ancien format" (pas de bouton là), backend.

### (b) Propositions d'amélioration — à valider individuellement

- **B1. Icône `RefreshCw` (lucide) au lieu de l'emoji 🔄** pour rester cohérent avec `Bookmark` / `BookmarkCheck` du bouton Sauvegarder juste à côté. Plus propre visuellement. *Si tu refuses, je garde l'emoji. ok*
- **B2. Désactivation globale pendant régénération** : empêcher AUSSI les boutons "Autres idées" / "Pousse plus loin" / "C'est parti" pendant qu'une carte régénère, pour éviter qu'un clic sur "Autres idées" écrase un appel en vol (race condition → réponse arrive après et remplace une idée inexistante). Implémentation : ajouter `disabled={regeneratingIdx !== null}` sur ces 3 boutons. ok
- **B3. Garde-fou contre réponse out-of-order** : capturer l'index ciblé dans une closure (déjà le cas) + vérifier dans le `setResult` que `prev.ideas[idx]` est bien encore `prevIdea` (sinon ignorer la réponse). Utile si B2 n'est pas accepté. non

### Critères de validation

- `npx tsc --noEmit --skipLibCheck` clean.
- 4 idées → clic "autre angle" sur la 2e → seule la 2e change, les 3 autres restent identiques et à leur place, `recommended_format` / `format_reason` préservés.
- Pendant la régen : 3 autres cartes visibles, pas d'écran loading plein.
- Réseau coupé → toast + carte garde son idée d'origine.
- Compte client free non-admin → -1 crédit par clic "autre angle" visible dans la jauge header.
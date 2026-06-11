## (a) Ce que tu m'as demandé

### Backend — `supabase/functions/creative-flow/index.ts`

1. **Augmenter `max_tokens` pour le step recycle**
  - Ligne 1438 (path générique) : `const maxTokens = step === "questions" ? 800 : step === "recycle" ? 8192 : undefined;`
  - Ligne 1310 (path recycle avec fichiers) : `max_tokens: 4096` → `max_tokens: 8192`
2. **Garde anti-échec silencieux (recycle uniquement)**
  Après le parse JSON (vers la ligne 1459, AVANT la passe de correction LinkedIn et AVANT `logUsage`), insérer :
   → `logUsage` (ligne 1487) n'est jamais atteint en cas d'échec, donc pas de crédit consommé.

### Frontend — `src/components/ContentRecycling.tsx`

3. **Garde côté UI** dans `handleRecycle` (lignes 147-151) :
  ```ts
   const { data, error } = await invokeWithTimeout("creative-flow", { body }, 120000);
   if (error) throw new Error(error.message);
   const r = data?.results || {};
   if (Object.keys(r).length === 0) {
     toast({
       title: "Génération incomplète",
       description: "La génération a échoué en cours de route. Réessaie, ou coche moins de formats à la fois.",
       variant: "destructive",
     });
     return; // évite l'insert content_recycling avec results vide
   }
   setResults(r);
   setActiveTab(formats[0] || "");
  ```
   Le `return` est placé AVANT l'insert `content_recycling` pour ne pas polluer la table avec une ligne vide. `setLoading(false)` reste géré par la sortie via le `try/catch/finally` actuel (en réalité c'est appelé après le bloc try — vérifier que le early-return n'empêche pas le reset : il faut donc passer `setLoading(false)` dans un `finally`, OU appeler `setLoading(false)` avant le `return`). Choix : ajouter un `finally { setLoading(false); }` et retirer le `setLoading(false)` final, plus propre.

## (b) Propositions d'amélioration connexes (à valider individuellement)

- **B1 — `finally { setLoading(false) }**` : déjà mentionné, refactor mineur du `try/catch` actuel qui laisse `loading=true` si une exception est lancée hors du `try` (peu probable mais propre). **Recommandé** car nécessaire au point 3.
- **B2 — Skip l'insert `content_recycling` aussi quand `r` est vide** : déjà couvert par le `return` au point 3.
- **B3 — Log côté backend en cas d'échec recycle** : ajouter `console.warn("[creative-flow] recycle returned empty results, raw=", rawContent?.slice(0, 500))` avant le `return 500`, pour faciliter le debug d'occurrences réelles sans coût utilisateur. **Recommandé**, 1 ligne. ok
- **B4 — (hors scope strict, mais lié)** Le path `step === "recycle" && filesArray.length > 0` n'utilise pas la même branche que le path générique : OK, les deux passent à `max_tokens: 8192` après ce patch. Pas d'autre changement nécessaire.

Pas d'autre dérive identifiée (prompt, upload, validation 20 Mo, limite 5 PDFs, runPipeline, autres steps : intacts).

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe
- Recyclage 5 formats sur texte long → 5 onglets complets
- Si échec simulé (ex. payload trop gros côté modèle) → toast destructif, crédit inchangé

Dis-moi si tu valides (a) tel quel + lesquelles de B1/B3 tu retiens, et je passe en build.
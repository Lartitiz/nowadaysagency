# Plan — Newsjacking : remonter les faits clés de l'article jusqu'à la génération

## (a) Ce que tu m'as demandé

### 1. `supabase/functions/newsjacking-from-url/index.ts`

**Prompt JSON (lignes 142-149)** — ajouter `faits_cles` :

```
"faits_cles": ["fait brut 1", "fait brut 2", ...]  // 4 à 8 entrées
```

Plus, dans les **Règles** (lignes 151-155), ajouter une règle anti-invention :
- "faits_cles" = chiffres, noms d'acteurs, dates, citations courtes, exemples nommés tirés de l'article. JAMAIS d'analyse, jamais de reformulation marketing. Si rien d'exploitable : `[]`. Ne fabrique JAMAIS un fait absent — mieux vaut un tableau vide.

**max_tokens (ligne 172)** : `1200` → `1600`.

**Construction `actu` (lignes 196-207)** — ajouter :

```ts
faits_cles: Array.isArray(parsed.faits_cles)
  ? parsed.faits_cles
      .filter((f: unknown): f is string => typeof f === "string")
      .map((f: string) => f.trim().slice(0, 200))
      .filter((f: string) => f.length > 0)
      .slice(0, 8)
  : [],
```

### 2. `src/components/creer/NewsjackingPanel.tsx`

**Interface `Actu` (lignes 19-31)** — ajouter `faits_cles?: string[]`.

**`handleSelectAngle` (ligne 528-536)** — enrichir le `context` entre la ligne `Résumé` et le bloc `ANGLE CHOISI` :

```ts
const faitsBloc = actu.faits_cles && actu.faits_cles.length > 0
  ? `\n\nFAITS DE L'ARTICLE (à exploiter, ne rien inventer d'autre) :\n${actu.faits_cles.map(f => `- ${f}`).join("\n")}`
  : "";
const context = `ACTUALITÉ : ${actu.titre}\nSource : ${actu.source}\nRésumé : ${actu.resume}\nPertinence : ${actu.pertinence}${faitsBloc}\n\nANGLE CHOISI :\nVéhicule : ${angle.vehicule}\nHook : ${angle.hook}\nDéveloppement : ${angle.description}\nFormat suggéré : ${angle.format_suggere}`;
```

Mêmes clés `{ subject, context, format, vehicule }` retournées par `onSelect`.

## (b) Mes propositions — à valider une par une

1. **Transmettre `faits_cles` à `newsjacking-angles`.** En lisant le code, je vois que les angles sont générés à la demande à partir d'`actu`. Si l'edge function `newsjacking-angles` reçoit aussi les faits, les angles eux-mêmes seraient ancrés (hook qui cite un chiffre, par ex), pas seulement la génération finale. À chiffrer dans un mini-passage du code de l'appel `newsjacking-angles` côté front pour confirmer. ✅/❌

2. **Ajouter une mention courte des faits dans la pertinence côté UI** (ex : "3 faits exploitables détectés") pour rassurer l'utilisatrice quand elle voit la card. ✅/❌ (purement cosmétique, je peux skip si tu veux rester strict sur le périmètre)

## Ce qui ne bouge pas

- Structure existante de `actu` : on ajoute `faits_cles`, rien d'autre.
- Scraping, quota `deep_research`, rate limit, workspace guard, timeout 50s, `robustJsonParse`, sets `ALLOWED_*` : intacts.
- `handleSaveActu`, affichage cards : intacts (champ optionnel → rétro-compatible).
- `newsjacking-angles` : intact sauf si tu valides la proposition (1).

## Validation

- `npx tsc --noEmit --skipLibCheck` : 0 erreur.
- Article riche → logs Edge montrent `faits_cles` peuplé, le contenu généré cite ≥ 1 fait réel.
- Tribune d'opinion → `faits_cles = []`, pas de crash, comportement identique à aujourd'hui.

## Hors scope (confirmé)

- Carrousel photo réactif à l'actu (chantier B).
- Prompt photo réactif (chantier C).
- Reset `newsjackingContext` dans `handlePhotosNext`.
- Toute modif `newsjacking-angles` au-delà de la proposition (1).

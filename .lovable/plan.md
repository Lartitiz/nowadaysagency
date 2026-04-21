

## Coaching IA "Mes séries signatures" — backend (version finale validée)

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/lib/coaching-checklists.ts` | Ajout checklist + labels `content_series` |
| `src/components/branding/BrandingCoachingFlow.tsx` | Type `Section`, `SECTION_META`, garde démo, `fetchContext` enrichi pour `content_series`, branche `saveInsights` (séries + mode combo + mapping cadence) |
| `src/pages/BrandingCoachingPage.tsx` | `VALID_SECTIONS` + `RECAP_ROUTES` |
| `supabase/functions/branding-coaching/index.ts` | `SECTION_CHECKLISTS`, `SECTION_NAMES`, `TOPIC_LABELS`, alias topics, bloc prompt `content_series`, validation Zod du shape `series[]`, truncation à 8 |

Aucun autre fichier touché.

### 1. Checklists (`coaching-checklists.ts`)

```ts
content_series: ["series_count", "series_pitch", "series_pillar_link", "series_format", "series_signature"]
```

Labels : "Combien de séries", "Nom et promesse de chaque série", "Rattachement aux piliers", "Format fixe", "Signature visuelle".

### 2. `BrandingCoachingFlow.tsx`

- Type `Section` étendu avec `"content_series"`.
- `SECTION_META.content_series` : 📺 / "Mes séries signatures" / description spec / "~6-8 min".
- **Garde démo** (proposition 6) : au tout début de `startCoaching` (ou équivalent), si `section === "content_series" && isDemoMode` → `toast.info("Pas dispo en mode démo, crée un compte")` + `onBack()`. Aucun appel Edge Function.
- **`fetchContext` enrichi UNIQUEMENT pour `content_series`** : ajout d'un select sur `brand_strategy` (`pillar_major`, `pillar_minor_1/2/3`, `creative_concept`) → injecté dans `ctx.brand_strategy`. Les autres sections inchangées.
- **Nouvelle branche `saveInsights` (`section === "content_series"`)** :
  - **A. Mapping cadence (proposition 1)** — helper local :
    ```ts
    function mapCadence(raw?: string): "weekly"|"biweekly"|"monthly"|"irregular"|null {
      if (!raw) return null;
      const s = raw.toLowerCase();
      if (/(hebdo|chaque semaine|toutes les semaines|weekly|every week)/.test(s)) return "weekly";
      if (/(bimensuel|tous les 15 jours|toutes les deux semaines|biweekly|every two weeks)/.test(s)) return "biweekly";
      if (/(mensuel|chaque mois|tous les mois|monthly|every month)/.test(s)) return "monthly";
      if (/(irrégulier|quand ça vient|sporadique|irregular|ad hoc)/.test(s)) return "irregular";
      // fallback : si LLM a déjà renvoyé l'enum directement
      if (["weekly","biweekly","monthly","irregular"].includes(s)) return s as any;
      return null;
    }
    ```
    Appliqué : `cadence: mapCadence(serie.cadence ?? serie.cadence_raw)`.
  - **B. Boucle d'écriture séries** : pour chaque objet de `insights.series` (au max 8, voir #4) :
    - Lookup `(workspace_id, name)` → `UPDATE` si existe, `INSERT` sinon.
    - `user_id: profileUserId`, `workspace_id: workspaceId !== profileUserId ? workspaceId : undefined`.
    - Champs absents (undefined) non insérés → defaults DB conservés.
    - `try/catch` par série : `console.error` + on continue.
  - **C. Mode combo `pillars_new`** : si présent (array 1-4), lookup `brand_strategy`. N'écrit `pillar_major`/`pillar_minor_1/2/3` QUE sur les colonnes actuellement NULL/empty. Aucune écrasure.
  - Invalidations React Query : `["series"]`, `["brand-strategy"]`, `["branding-data"]`, `["branding-completion"]`.

### 3. `BrandingCoachingPage.tsx`

- `VALID_SECTIONS` += `"content_series"`.
- `RECAP_ROUTES.content_series = "/branding/section?section=content_strategy&tab=series"` (tab futur, fallback acceptable).

### 4. Edge Function `branding-coaching/index.ts`

- `SECTION_CHECKLISTS.content_series`, `SECTION_NAMES.content_series`, `TOPIC_LABELS` : ajouts.
- `normalizeCoveredTopic` : alias (`nombre_series`, `combien`, `nom`, `promesse`, `pitch`, `pilier`, `rattachement`, `format`, `signature`, `visuel`).
- `buildSystemPrompt` :
  - Lecture `context.brand_strategy` → construit `pillarsContext` (texte des piliers, ou "Aucun pilier défini" → mode combo).
  - Bloc conditionnel `if (section === "content_series")` AVANT le `else` final, contenant l'intro pédagogique (parcours pilier-par-pilier OU mode combo avec extraction `pillars_new`), règle anti-format-listé, et le bloc `extracted_insights` strict (schéma de l'array `series` + `pillars_new` optionnel + indication d'extraire `cadence` en texte libre type "chaque vendredi" — le mapping vers l'enum se fait côté client).
- **Truncation (proposition 4, seuil 8)** : juste après le `safeParseAIResponse`, si `parsed.extracted_insights?.series?.length > 8`, garder les **8 derniers éléments** (les plus récents) silencieusement. `console.warn` pour debug.
- **Validation Zod (proposition 5)** : juste après la truncation, valider le shape `series[]` :
  ```ts
  const SeriesItemSchema = z.object({
    name: z.string().min(1),
    promise: z.string().min(1),
    pillar_key: z.enum(["pillar_major","pillar_minor_1","pillar_minor_2","pillar_minor_3"]).nullable().optional(),
    cadence: z.string().optional(),       // texte libre, mappé côté client
    cadence_raw: z.string().optional(),   // alias accepté
    format_template: z.string().optional(),
    signature_description: z.string().optional(),
    channels: z.array(z.string()).optional(),
  });
  const SeriesArraySchema = z.array(SeriesItemSchema);
  ```
  Filtrage : on garde uniquement les items qui passent la validation. Les rejets sont `console.warn`-és, pas renvoyés. Le flow continue même si tout est rejeté (l'utilisateur peut continuer la conversation).
- Le quota reste `checkQuota("coach", …)` — pas de nouvelle catégorie.

### Ce qui ne bouge pas

- Logique des autres sections (story, persona, tone_style, content_strategy, offers, charter) : zéro refacto.
- Schéma DB : aucune migration. Tables `series` (Plan 1) et `brand_strategy` utilisées telles quelles.
- Mode démo (DemoContext, demo-coaching-data.ts) : seul ajout = la garde au début du flow.
- Routes/navigation hors `RECAP_ROUTES` : inchangé.
- `BrandingSectionPage.tsx` : intouché (Plan 3).

### Validation post-merge

1. `npx tsc --noEmit --skipLibCheck` → 0 erreur.
2. Edge function déployée, logs clean.
3. Scénario "avec piliers" : 2 séries définies → `SELECT * FROM series WHERE workspace_id = '…'` retourne 2 lignes avec `pillar_key` correct, `cadence` mappée vers l'enum.
4. Scénario "mode combo" : `brand_strategy` rempli (sans écraser de piliers existants partiels) ET séries créées.
5. Cadence orale "chaque vendredi" → DB = `weekly`. Cadence farfelue → DB = `NULL` (pas d'erreur CHECK).
6. Mode démo : clic sur "Lancer coaching séries" → toast + retour, aucun appel Edge.
7. Quota `coach` décrémenté.
8. Isolation workspace OK.

### Risques

Très faibles. Pattern dupliqué d'une fondation éprouvée. Le seul risque résiduel (LLM qui invente une cadence ou des clés) est mitigé par : mapping regex côté client + validation Zod côté Edge + truncation à 8.


# Plan — Le carrousel recyclé devient un vrai carrousel dans le calendrier

## (a) Ce que tu m'as demandé

### 1. Backend — `supabase/functions/creative-flow/index.ts` (step `recycle` uniquement)

Dans le system prompt du step `recycle` (~lignes 740-748), modifier la spec
JSON de sortie pour que la clé `carrousel` (si demandée) soit un objet
structuré, les autres formats restent des strings :

```json
{
  "results": {
    "carrousel": {
      "slides": [
        { "slide_number": 1, "title": "...", "body": "..." },
        ... 8 slides
      ],
      "caption": { "hook": "...", "body": "...", "cta": "..." }
    },
    "reel": "string complet",
    "stories": "string complet",
    "linkedin": "string complet",
    "newsletter": "string complet"
  },
  "topics": { ... inchangé ... }
}
```

Construction dynamique : pour chaque format demandé, émettre la ligne
correspondante (objet structuré pour `carrousel`, string sinon). Garder
toutes les règles de longueur actuelles (8 slides, hook/dev/punchline, etc.)
et les reporter dans la description de la structure carrousel.

Aucun changement à : `hasResults` (vérifie juste la présence de la clé,
fonctionne avec objet ou string), `checkQuota`/`logUsage`, passe LinkedIn,
autres steps, `topics`.

### 2. Frontend — `src/components/ContentRecycling.tsx`

**a. Nouveau state** :
```ts
const [carouselStructure, setCarouselStructure] = useState<
  { slides: Array<{ slide_number: number; title: string; body: string }>;
    caption: { hook: string; body: string; cta: string } } | null
>(null);
```

**b. Réception (`handleRecycle`, après `const r = data?.results || {}`)** :

Si `r.carrousel` est un objet avec `slides` (Array) :
- `setCarouselStructure({ slides: r.carrousel.slides, caption: r.carrousel.caption })`
- Générer une version texte lisible :
  ```
  Slide 1 — {title}
  {body}
  
  Slide 2 — {title}
  ...
  
  ──────────
  Légende
  
  {hook}
  
  {body}
  
  {cta}
  ```
- Remplacer `r.carrousel` par cette string AVANT `setResults(r)` pour que
  tout le rendu existant (`<pre>`, Copier, `RedFlagsChecker`) reste
  inchangé.

Si `r.carrousel` est une string (rétro-compat) : `setCarouselStructure(null)`,
comportement actuel inchangé.

L'insert dans `content_recycling` (ligne 175-182) reste tel quel : la
colonne `results` est JSON, elle accepte la structure objet OU la string
indifféremment — on lui passe l'objet original (`r` avant transformation
en string lisible) pour garder la donnée brute exploitable.

→ ajustement : faire une copie pour l'affichage. Garder `r` original pour
le DB insert, set `results` avec la version texte.

**c. `handleAddToCalendar`** (ligne 235) :

```ts
if (activeTab === "carrousel" && carouselStructure) {
  insertData.story_sequence_detail = {
    type: "carousel",
    slides: carouselStructure.slides,
    caption: carouselStructure.caption,
  };
}
```

**d. RedFlagsChecker `onFix`** (ligne 410) : si `activeTab === "carrousel"`,
appeler aussi `setCarouselStructure(null)` → la correction texte invalide
la structure, le post part en texte seul.

**e. Reset "Nouveau recyclage"** (ligne 423) : ajouter
`setCarouselStructure(null)`.

## Ce qui ne bouge pas

- Autres steps de `creative-flow` (questions, generate, dictation, angles…)
- Garde `hasResults`, pattern `checkQuota`/`logUsage`, passe LinkedIn
- 4 autres formats de recyclage (string, rendu, planification identiques)
- `CrosspostFlow`, `InspireFlow`, `AddToCalendarDialog`, `SaveToIdeasDialog`,
  `ContentPreview`, `CalendarPostContent`, `CalendarPostDialog`,
  `CarouselPreview`
- Upload de fichiers, dictée vocale, insert `content_recycling`

## Validation

- `npx tsc --noEmit --skipLibCheck` OK
- Recycler avec carrousel coché → onglet Carrousel affiche le texte
  slide-par-slide lisible, Copier OK
- Planifier → calendar_post a `story_sequence_detail` typé carousel →
  "👁️ Voir les slides" + "🎨 Générer les visuels" apparaissent
- 3 formats cochés (carrousel + reel + stories) → reel/stories planifiés
  comme avant (texte seul)
- Correction RedFlags sur carrousel → planification en texte seul, OK
- Aucune régression Crosspost / S'inspirer

## (b) Propositions optionnelles (à valider séparément)

1. **Persister la structure dans `content_recycling.results`** : le code
   stocke déjà l'objet brut, ce qui permettrait plus tard de retrouver la
   structure depuis l'historique. Ce plan le fait gratuitement en gardant
   `r` original pour l'insert DB. À confirmer.

2. **Garde-fou côté backend** : valider que `carrousel.slides.length === 8`
   et que `caption.hook/body/cta` sont non-vides ; sinon, fallback en
   string (concaténation côté serveur) pour éviter qu'un JSON partiel
   arrive vide côté UI. Léger (~10 lignes), évite un crash d'affichage si
   l'IA ne respecte pas la spec.

3. **Désactiver le bouton "Planifier" si la structure carrousel a été
   invalidée par RedFlags** : afficher un petit hint "Planifié en texte
   seul, les slides ne seront pas conservées" sous le bouton dans ce cas.
   Pure UX, hors scope strict.

Dis-moi lesquelles tu veux que j'embarque avant d'exécuter.

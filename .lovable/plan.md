## Diagnostic — pourquoi nos prompts actuels ne suivent pas l'étude

L'étude pose une thèse simple : **HTML d'abord pour explorer, PPTX ensuite pour exécuter**, et entre les deux on extrait des **invariants explicites** (palette hex, polices PPTX-safe, tailles en points, motif visuel récurrent).

Aujourd'hui, nos prompts violent cette discipline à deux endroits :

- `**carousel-visual**` (Instagram) — Le prompt mélange exploration créative et contraintes PPTX dans une même passe. Il génère du HTML très expressif (Google Fonts, gradients, ombres custom, border-radius fins, lignes décoratives sous les titres) sans **aucune notion** que ça finira en PPTX. Au moment de l'export, on doit deviner les invariants → mismatch garanti.
- `**pinterest-visual**` + `export-pinterest-editable-pptx` — Mieux loti car le PPTX est généré from-scratch en pptxgenjs, mais les deux mondes (HTML pour preview, PPTX pour export) sont **désynchronisés** : palette identique mais layouts, paddings, badges et hiérarchies typographiques sont décrits **deux fois** dans deux codes différents qui dérivent indépendamment.

L'étude propose une méthode (workflow en 6 étapes). Je traduis ça en prompts.

---

## Plan — 4 chantiers

### Chantier 1 — Introduire un "contrat d'invariants" dans la charte

Créer un objet `pptx_invariants` calculé à partir de `brand_charter`, persisté ou au minimum centralisé dans une fonction utilitaire partagée Edge / front. Cet objet sera **la source de vérité** pour tous les prompts visuels et tous les exporters PPTX.

Forme : mais ici c'est mon identité ? ou celle pris dans la charte graphique ?

```ts
{
  palette: {
    primary_hex: "#FB3D80",
    secondary_hex: "#91014b",
    accent_hex: "#FFE561",
    bg_hex: "#FFF4F8",
    text_hex: "#1A1A2E",
    dominant: "primary",      // pour la règle 60-70% / 20-30% / 10%
  },
  typography: {
    title_google: "Libre Baskerville",
    body_google: "IBM Plex Mono",
    title_pptx_safe: "Georgia",       // mappé via mapFontToPptx
    body_pptx_safe: "Calibri",
    title_pt: 40,                      // taille pivot en points
    body_pt: 16,
    caption_pt: 11,
  },
  layouts_allowed: ["hook_card", "two_column_60_40", "stack_centered", "photo_overlay"],  // max 4
  motif: "carte_blanche_ombre_douce",  // un seul motif récurrent
  pptx_dont: ["lignes décoratives sous titres", "fonds beige", "border-radius < 4px"],
}
```

Fichier : `supabase/functions/_shared/pptx-invariants.ts` (Edge) + `src/lib/pptx-invariants.ts` (front, même shape).

Bénéfice : on arrête de redéfinir 12 fois "le titre fait 52-64px" dans des prompts dispersés.

### Chantier 2 — Refonte du prompt `carousel-visual` en 2 sections distinctes

Aujourd'hui le system prompt mélange tout. On le scinde clairement :

**Section A — "Liberté HTML (exploration)"**

- Garde les Google Fonts, ombres douces, gradients, badges pilules, emojis décoratifs.
- C'est ce qui rend la preview belle dans la web app (où le client·e voit le carrousel).
- Rappelle les anti-clichés : pas de gradient violet/blanc générique, pas de Inter par défaut, varier les compositions.

**Section B — "Contrat PPTX (exécution)"**

- Liste explicitement les **invariants PPTX** issus du chantier 1.
- Règles dures :
  - Aucune ligne décorative sous les titres (signature IA proscrite par l'étude).
  - Aucun fond beige/crème par défaut (ban explicite F5F5DC, FAF0E6).
  - Maximum 3-4 layouts différents pour tout le carrousel — cohérence > variété.
  - Préférer un aplat de couleur dominante + un accent ponctuel à un gradient complexe.
  - Border-radius minimum 8px (les fines bordures arrondies se rendent mal en PPTX).
  - Texte avec marge d'air : si un titre fait 4 lignes en HTML il en fera 5 en PPTX → prévoir des contenants 15% plus grands que nécessaire.
- Annotations `data-pptx-editable` (déjà en place depuis le tour précédent).

**Section C — "Output"**

- Toujours du JSON `slides_html`, mais on ajoute un sibling `slides_invariants` retourné par le modèle, qui récapitule explicitement la palette utilisée, le pairing typo, les layouts choisis. Cet objet sera passé à l'exporter PPTX → fini la phase de devinette côté front.

### Chantier 3 — Aligner `pinterest-visual` et `export-pinterest-editable-pptx`

Le HTML preview (via `pinterest-visual`) et le PPTX (via `pinterest-editable-pptx`) doivent générer le **même design**, pas deux interprétations parallèles du même `pin_type`.

- Faire que le prompt de `pinterest-visual` produise un HTML qui suit les mêmes coordonnées (en %) que celles utilisées par `pinterest-editable-pptx` (positions absolues en pouces). Concrètement : pour un pin "infographie", le badge en haut centré, le titre à 18% du haut, la liste numérotée à partir de 30% — décrit en pourcentages dans le HTML, traduit en pouces dans le PPTX.
- Documenter ces coordonnées une fois dans `pptx-invariants.ts` chantier 1, et les **inclure littéralement dans le prompt HTML** (pas juste "centré en haut" → "top: 7%, height: 5%, centered").

Bénéfice : le client·e voit en preview exactement ce qu'iel obtiendra en PPTX. Plus de "ah tiens c'est différent quand je télécharge".

### Chantier 4 — Ajouter une instruction "single-pass execution" + pre-check

L'étude insiste : **ne pas itérer plus d'une fois sur le PPTX**. Adapter ça à notre usage automatisé :

- Côté `carousel-visual`, ajouter une instruction de **self-check** dans le prompt : avant de retourner les slides, le modèle doit vérifier que (1) chaque titre tient en ≤3 lignes à la taille indiquée, (2) chaque corps de texte ≤6 lignes, (3) aucune slide ne réutilise littéralement la même mise en page que la précédente sauf intention explicite. Si un défaut est détecté, le modèle corrige **dans la même passe** plutôt que de retourner du contenu connu cassé.
- Côté front, ne **pas** ré-appeler le modèle après l'export. La passe de correction visuelle est déjà absorbée par le self-check.

### Détails techniques

Fichiers touchés :

- **Nouveau** `supabase/functions/_shared/pptx-invariants.ts` — Builder + types.
- **Nouveau** `src/lib/pptx-invariants.ts` — Même shape côté front, importé par les exporters.
- `supabase/functions/carousel-visual/index.ts` — Refonte du `systemPrompt` en 3 sections (A/B/C), output JSON enrichi avec `slides_invariants`.
- `supabase/functions/pinterest-visual/index.ts` — Aligner les coordonnées sur celles de `export-pinterest-editable-pptx.ts`.
- `src/lib/export-carousel-hybrid-pptx.ts` — Lire `slides_invariants` retourné par l'edge function et l'utiliser pour fixer les polices/tailles plutôt que de les détecter via `getComputedStyle`.
- `src/lib/export-pinterest-editable-pptx.ts` — Importer les coords depuis `pptx-invariants.ts` au lieu de les hardcoder.

Pas de changement DB (la charte existe déjà), pas de changement UI utilisateur.

### Validation

Tester sur 3 cas représentatifs :

1. Un carrousel Instagram texte (5 slides) — vérifier que la preview HTML et le PPTX exporté ont la **même** palette, le même pairing typo, et 3 layouts maxi sur 5 slides.
2. Une épingle Pinterest "infographie" — vérifier que le HTML preview et le PPTX sont **superposables** à 95% visuellement.
3. Un carrousel photo Instagram avec overlay — vérifier que `slides_invariants` retourné contient bien les coords de l'overlay et qu'elles sont respectées dans le PPTX.

Critères d'acceptation :

- Aucune slide PPTX avec ligne décorative sous un titre.
- Aucune slide PPTX avec fond beige/crème par défaut.
- Pour un même contenu, palette identique entre preview HTML et PPTX (codes hex matchent).
- Pour un même contenu, ≤4 layouts différents sur l'ensemble du deck.

### Hors-scope

- Refonte du système d'export image fidèle (`export-carousel-visual-pptx.ts` est déjà déprécié).
- Création d'un mode "PDF depuis HTML" pour les livrables non-éditables (l'étude le recommande mais c'est une feature séparée).
- Modification des autres flux génératifs (newsletter, linkedin, etc.) qui ne produisent pas de PPTX.
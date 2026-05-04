
# 4 nouveaux schémas visuels narratifs

## Périmètre confirmé (a — ce que tu m'as demandé)

Ajouter 4 schémas (`story_arc`, `quote_big`, `objection_response`, `process_visible`) dans le système visual_schema, alignés sur les véhicules narratifs du framework "Éducation embarquée".

**Fichiers touchés :**
- `supabase/functions/carousel-ai/index.ts` (déclaration des types + cas d'usage, lignes 884-936)
- `supabase/functions/carousel-visual/index.ts` (templates HTML/CSS dans `buildVisualSchemaBlock`, lignes 16-106)

**Pas touchés :** les 11 schémas existants, le pipeline export PPTX schema-native (`supportedSchemaTypes` ligne 204 de `export-carousel-pptx.ts`), le pipeline hybride C2, les modes photo/mix de carousel-visual, le routing `slides.filter(s => s.visual_schema)` (ligne 463).

---

## Détail des 4 schémas

### 1. STORY_ARC — récit en 3-5 étapes

**Données (carousel-ai) :**
```json
{ "type": "story_arc", "steps": [
  { "label": "Au départ", "desc": "..." },
  { "label": "Le déclic", "desc": "..." },
  { "label": "Le tournant", "desc": "..." },
  { "label": "Aujourd'hui", "desc": "..." }
] }
```
3-5 étapes (4 idéal). Cas d'usage prompt : récit personnel, parcours client, transformation, évolution d'une vision.

**Template HTML/CSS (carousel-visual) :**
```html
<div style="display:flex;flex-direction:column;gap:0">
  <!-- Pour chaque step (i = index 0-based) : -->
  <div style="display:flex;gap:24px;align-items:flex-start;position:relative">
    <div style="flex-shrink:0;width:64px;text-align:right">
      <span data-pptx-editable="caption" style="font-size:36px;font-weight:700;color:${ch.color_primary};opacity:0.4;font-family:${ch.font_title}">0{i+1}</span>
    </div>
    <div style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:24px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.05);margin-bottom:16px">
      <h3 data-pptx-editable="title" style="font-size:24px;font-weight:600;color:${ch.color_primary};margin:0 0 8px 0;font-family:${ch.font_title}">LABEL</h3>
      <p data-pptx-editable="body" style="font-size:20px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
    </div>
  </div>
  <!-- Filet pointillé entre steps (sauf après le dernier) :
       <div style="margin-left:88px;width:2px;height:20px;border-left:2px dotted ${ch.color_secondary};opacity:0.4"></div> -->
</div>
```

### 2. QUOTE_BIG — citation typographique

**Données :**
```json
{ "type": "quote_big",
  "quote": "Texte de la citation, 1-3 lignes max",
  "attribution": "— Prénom, contexte (optionnel)",
  "context": "Phrase d'introduction (optionnelle)" }
```
Cas d'usage prompt : témoignage, retour terrain, citation auto-portée forte.

**Template :**
```html
<div style="position:relative;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;height:100%">
  <!-- Si context présent : -->
  <p data-pptx-editable="caption" style="font-size:22px;color:${ch.color_secondary};margin-bottom:24px;font-family:${ch.font_body}">CONTEXT</p>
  <!-- Guillemet décoratif -->
  <span aria-hidden="true" style="position:absolute;top:20px;left:40px;font-size:140px;line-height:1;color:${ch.color_primary};opacity:0.2;font-family:Georgia,serif">"</span>
  <p data-pptx-editable="title" style="font-size:48px;font-style:italic;line-height:1.3;color:${ch.color_text};margin:0;font-family:${ch.font_title};font-weight:normal">QUOTE</p>
  <!-- Si attribution présente : -->
  <p data-pptx-editable="body" style="font-size:22px;color:${ch.color_secondary};margin-top:32px;font-family:${ch.font_body}">ATTRIBUTION</p>
</div>
```
Taille de la citation : 48px par défaut, 40px si > 120 chars, 56px si < 60 chars (la consigne le précise dans le prompt).

### 3. OBJECTION_RESPONSE — déconstruction verticale

**Données :**
```json
{ "type": "objection_response",
  "objection": "Ce qu'on dit / la croyance",
  "response": "Ma position / la réalité" }
```
Cas d'usage prompt : prise de position, déconstruction d'idée reçue, "mythe vs réalité" en format vertical narratif (à la différence de `comparison` côte à côte).

**Template :**
```html
<div style="display:flex;flex-direction:column;gap:32px">
  <div style="background:${ch.color_secondary}15;border-radius:${ch.border_radius || 12}px;padding:32px;position:relative">
    <span aria-hidden="true" style="position:absolute;top:16px;right:24px;font-size:32px;color:${ch.color_primary};opacity:0.5">❝</span>
    <p data-pptx-editable="caption" style="font-size:18px;font-weight:600;color:${ch.color_secondary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">CE QU'ON DIT</p>
    <p data-pptx-editable="body" style="font-size:24px;color:${ch.color_text};line-height:1.4;margin:0;font-style:italic;font-family:${ch.font_body}">OBJECTION</p>
  </div>
  <div style="background:#FFF;border-left:4px solid ${ch.color_primary};border-radius:${ch.border_radius || 12}px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
    <p data-pptx-editable="caption" style="font-size:18px;font-weight:600;color:${ch.color_primary};text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;font-family:${ch.font_body}">MA POSITION</p>
    <p data-pptx-editable="title" style="font-size:30px;color:${ch.color_text};line-height:1.4;margin:0;font-weight:500;font-family:${ch.font_title}">RESPONSE</p>
  </div>
</div>
```
Hiérarchie visuelle : la response est plus grande (30px vs 24px) — elle domine.

### 4. PROCESS_VISIBLE — 3 colonnes Avant/Pendant/Après

**Données :**
```json
{ "type": "process_visible", "stages": [
  { "label": "Avant", "desc": "..." },
  { "label": "Pendant", "desc": "..." },
  { "label": "Après", "desc": "..." }
] }
```
**Toujours exactement 3 stages.** Labels libres ("Le brief / Le travail / Le rendu", "Le matin / La journée / Le soir"…). Si l'IA donne 2 ou 4 stages → fallback (cf. proposition d'amélioration #3 ci-dessous).

**Template :**
```html
<div style="display:flex;align-items:stretch;gap:16px">
  <!-- Pour chaque stage : -->
  <div style="flex:1;background:#FFF;border-radius:${ch.border_radius || 12}px;padding:28px 20px;box-shadow:0 2px 12px rgba(0,0,0,0.05);position:relative">
    <span data-pptx-editable="caption" style="font-size:64px;font-weight:700;color:${ch.color_primary};opacity:0.25;line-height:1;font-family:${ch.font_title};display:block;margin-bottom:8px">0{i+1}</span>
    <h3 data-pptx-editable="title" style="font-size:24px;font-weight:600;color:${ch.color_secondary};margin:0 0 12px 0;font-family:${ch.font_title}">LABEL</h3>
    <p data-pptx-editable="body" style="font-size:18px;color:${ch.color_text};line-height:1.4;margin:0;font-family:${ch.font_body}">DESC</p>
  </div>
  <!-- Flèche entre colonnes (sauf après la dernière) : -->
  <div style="display:flex;align-items:center;flex-shrink:0">
    <span aria-hidden="true" style="font-size:32px;color:${ch.color_primary};font-weight:300">→</span>
  </div>
</div>
```

---

## Mises à jour de la section "QUAND utiliser un schéma" (carousel-ai ligne 924-929)

Ajouter sous la liste actuelle :
- `Slide récit / parcours / transformation → story_arc`
- `Slide témoignage / parole donnée / citation forte → quote_big`
- `Slide qui déconstruit une idée / prise de position en mode mythe-vs-vision → objection_response (en complément de comparison qui reste valide pour 2 colonnes côte à côte)`
- `Slide qui montre un travail invisible en 3 temps → process_visible`

Section "QUAND NE PAS utiliser de schéma" (ligne 931) : **inchangée**. Le hook reste toujours du texte pur même quand le carrousel est narratif.

---

## (b) Propositions d'amélioration — à valider individuellement

### Proposition #1 — Cap mots dans `story_arc.steps[].desc`

**Pourquoi :** sans cap, Opus écrit parfois 30 mots dans `desc`, ce qui déborde la carte (24px line-height 1.4 dans une carte de ~600px de large = max ~15 mots avant retour à la ligne moche). Risque de slide visuellement cassée.

**Quoi :** ajouter dans le prompt carousel-ai à côté de la définition du type : *"chaque `desc` : 8-15 mots MAX, 1 phrase courte. Le LABEL fait le travail de signalisation, le DESC précise."*

**Coût :** 1 phrase ajoutée. **Risque régression :** zéro.

### Proposition #2 — Variations selon `ch.mood_keywords`

**Pourquoi :** les templates actuels (before_after, etc.) ne s'adaptent pas au mood (minimal/maximaliste/éditorial). Les nouveaux schémas hériteraient du même problème.

**Recommandation : NON, à exclure de ce sprint.** Risque de fragmentation, debug compliqué (chaque mood × chaque schéma = matrice exponentielle), inconsistance avec les 11 schémas existants. Si ça doit se faire, ça doit être un sprint dédié qui couvre TOUS les schémas, pas seulement les 4 nouveaux.

### Proposition #3 — Fallback si données incomplètes

**Pourquoi :** Opus peut générer un `process_visible` avec 2 stages au lieu de 3, ou un `story_arc` à 1 step, ou un `quote_big` sans `quote`. Aujourd'hui le template HTML aurait un trou.

**Quoi :** dans le prompt `buildVisualSchemaBlock` du carousel-visual, ajouter une instruction de tolérance : *"Si `process_visible.stages.length !== 3` → rends quand même proprement (2 colonnes au lieu de 3, ou ajoute un placeholder neutre). Si `quote_big.quote` est absent → utilise `slide.title` à la place. Si `story_arc.steps.length < 3` → rends comme une simple liste verticale."*

**Coût :** 4 lignes ajoutées au prompt. **Risque régression :** zéro. **Recommandé.**

### Proposition #4 — Parsing strict côté carousel-ai

**Pourquoi :** au lieu de gérer les fallbacks côté visual, on peut imposer la validité côté ai (refuser de retourner un schéma incomplet).

**Quoi :** dans la définition des types ligne 891-922, ajouter une mention "RÈGLE : si tu ne peux pas remplir toutes les clés requises, n'utilise PAS ce schéma — préfère un autre type ou du texte pur."

**Coût :** 1 ligne. **Combinable avec #3 (ceinture + bretelles).** **Recommandé.**

### Proposition #5 — Annoter `data-pptx-editable` partout

**Pourquoi :** confirmé dans le brief. Sans ces annotations, le pipeline hybride C2 (`extractAnnotatedBlocks`) ne récupère pas les textes.

**Quoi :** déjà inclus dans les 4 templates ci-dessus (`title` pour le texte principal, `body` pour les descriptions, `caption` pour les numéros/labels secondaires). **Inclus dans le périmètre (a), pas optionnel.**

---

## Critères de validation

1. **Compilation Deno OK** : déploiement de `carousel-ai` et `carousel-visual` sans erreur de syntaxe.

2. **Test fonctionnel — 4 carrousels test :**
   - Sujet "Mon parcours en 4 temps" → ≥1 slide `story_arc`
   - Sujet "Le retour client qui m'a marquée" → ≥1 slide `quote_big`
   - Sujet "Ce qu'on dit du SEO vs ma vision" → ≥1 slide `objection_response`
   - Sujet "À quoi ressemble une journée chez moi" → ≥1 slide `process_visible`

3. **Rendu PNG vérifié** : couleurs charte appliquées, padding cohérent, pas de cercle décoratif (règle anti-pattern ligne 425), texte lisible.

4. **Non-régression** : générer un carrousel "data-driven" et confirmer que les 11 schémas existants apparaissent toujours quand pertinent.

5. **Annotations PPTX** : grep `data-pptx-editable` dans le HTML rendu pour les 4 nouveaux schémas — au moins `title` et `body` présents par slide.

---

## Hors scope confirmé

- Pas de `buildStoryArcSchema` / etc. dans `export-carousel-pptx.ts` (fallback pptxgenjs natif). Si export schema-native est tenté, retombe sur le rendu texte standard — comportement acceptable.
- Pas de Phase 2 (typo expressive systématique), Phase 3 (motif signature), pas d'auto-routing programmatique.
- Pas de fix `extractAnnotatedBlocks` rich text inline (Phase 0 séparée).

---

## Décision attendue

Confirme :
- ✅ Périmètre (a) tel quel
- ✅/❌ Proposition #1 (cap mots story_arc)
- ❌ Proposition #2 (variations mood) — recommandation : refuser
- ✅/❌ Proposition #3 (fallback prompt visual)
- ✅/❌ Proposition #4 (validation côté ai)
- ✅ Proposition #5 (annotations) — déjà dans le périmètre

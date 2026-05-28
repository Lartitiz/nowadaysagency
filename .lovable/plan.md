# Préciser le type d'actu avant la recherche

## Idée

Au lieu de lancer la recherche à l'aveugle, on ajoute une **étape d'intention** sur l'écran "Lancer la recherche". L'utilisatrice peut :
- soit choisir un ou plusieurs **vibes** prédéfinis (chips),
- soit taper une **demande libre** ("J'aimerais une actu scoop qui fait réagir"),
- soit les deux, soit rien (= comportement actuel).

L'intention est passée au backend qui l'injecte dans le prompt + la requête Perplexity.

## UX (NewsjackingPanel.tsx)

L'écran idle devient :

```text
📰 Trouver des actus à surfer pour ta marque

(L'IA explore l'actu fraîche…)

┌────────────────────────────────────────────┐
│ Quel type d'actu tu cherches ? (optionnel) │
│                                            │
│ [💥 Scoop qui fait réagir]                 │
│ [🌀 Phénomène culturel du moment]          │
│ [⚖️ Débat clivant]                         │
│ [📊 Stat ou étude étonnante]               │
│ [🌱 Tendance émergente]                    │
│ [🎬 Sortie culturelle]                     │
│ [🧭 Sur mon combat : {combat_cause}]       │  ← affiché seulement si dispo
│                                            │
│ Ou précise toi-même :                      │
│ [______________________________________]   │
│  "ex: une actu qui touche les mamans…"     │
└────────────────────────────────────────────┘

[✨ Lancer la recherche]
```

- Chips multi-sélection (max 3 pour éviter le bruit).
- Le chip "Sur mon combat" n'apparaît que si `brand_profile.combat_cause` est défini.
- Textarea libre, max 200 caractères.
- Tout est **optionnel** : sans sélection, on garde le comportement actuel.

État local : `selectedVibes: string[]`, `customIntent: string`.

Le body de l'invoke devient :
```ts
{ workspace_id, intent: { vibes: selectedVibes, custom: customIntent.trim() || undefined } }
```

## Backend (`supabase/functions/newsjacking-ai/index.ts`)

### 1. Mapping des vibes → axes + ton attendu

Table interne :
```ts
const VIBES = {
  scoop:      { axe: "actu_connectable",      ton: "decalant",   query_hint: "scoop révélation qui fait réagir" },
  phenomene:  { axe: "obsession_collective",  ton: "entre_deux", query_hint: "phénomène culturel viral du moment" },
  debat:      { axe: "debat_recurrent",       ton: "entre_deux", query_hint: "débat clivant société polémique" },
  stat:       { axe: "comportement_emergent", ton: "confortable", query_hint: "étude statistique chiffre étonnant" },
  tendance:   { axe: "mot_qui_revient",       ton: "confortable", query_hint: "tendance émergente nouvelle pratique" },
  culture:    { axe: "objet_culturel",        ton: "decalant",    query_hint: "film série livre sortie récente" },
  combat:     { axe: null /* dynamique */,    ton: "entre_deux",  query_hint: "<combat_cause> débat actualité" },
};
```

### 2. Sélection des axes

Si `intent.vibes` non vide :
- `pickedAxes` ← axes correspondants (au lieu du shuffle aléatoire actuel).
- Si moins de 3 vibes, on complète avec des axes aléatoires pour garder la diversité.

### 3. Bloc "intention" dans le prompt système

Ajout d'un bloc clairement marqué :
```text
══════════════════════════════════════════════
DEMANDE EXPLICITE DE LA CRÉATRICE
══════════════════════════════════════════════
Vibes recherchés : Scoop qui fait réagir, Débat clivant
Précision libre : "une actu qui touche les mamans solos"

→ Les actus proposées DOIVENT correspondre à cette demande.
→ Si tu ne trouves rien d'aligné, dis-le franchement plutôt que de
   forcer des sujets hors-sujet.
```

### 4. Requêtes Perplexity adaptées

`universKeywords` est complété par `query_hint` des vibes choisies + 3-5 premiers mots du `custom`. Ça réoriente la recherche fraîche vers ce qu'elle a demandé.

### 5. Rétro-compat

Si `intent` absent (ancien client), comportement actuel inchangé.

## Fichiers touchés

- `src/components/creer/NewsjackingPanel.tsx` — écran idle enrichi (chips + textarea), state local, body de l'invoke.
- `supabase/functions/newsjacking-ai/index.ts` — lecture de `intent`, table `VIBES`, sélection d'axes contrainte, bloc prompt, hint Perplexity.
- Pas de migration DB. Pas de table à créer.

## À valider avant que je code

1. Tu valides la liste de vibes (scoop / phénomène / débat / stat / tendance / culture + combat dynamique) ou tu veux qu'on remplace/ajoute des intitulés ?
2. Le chip "combat" : OK pour afficher le libellé brut de `combat_cause` (genre "Sur mon combat : démocratiser le marketing éthique") ou tu préfères un libellé fixe ?

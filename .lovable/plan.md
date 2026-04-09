

# Audit : Pourquoi deux systèmes de génération de contenu coexistent

## Constat

L'app a **deux Edge Functions distinctes** qui génèrent du contenu texte, avec des prompts, des modèles et des contextes différents :

```text
┌─────────────────────────┐     ┌─────────────────────────┐
│   generate-content      │     │   creative-flow         │
│   (599 lignes)          │     │   (1083 lignes)         │
│                         │     │                         │
│ • Mode "express"        │     │ • Mode "complet"        │
│ • Pas de streaming      │     │ • Streaming SSE         │
│ • Pas de questions      │     │ • Questions → Génération│
│ • Pas d'angles édito    │     │ • Angles éditoriaux     │
│ • Prompts plus courts   │     │ • depthMandate riche    │
│ • Anti-slop basique     │     │ • Anti-broetry avancé   │
└─────────────────────────┘     └─────────────────────────┘
```

## Qui appelle quoi

### `generate-content` (le "couteau suisse" historique) — 15+ types
Appelé depuis :
- **SuggestedContents** → `type: "express-draft"` (brouillon rapide depuis les suggestions hebdo)
- **SuggestedContents** → `type: "weekly-suggestions"` (générer 3 idées de la semaine)
- **CalendarPostDialog** → `type: "calendar-quick"` (rédiger depuis le calendrier)
- **RedactionFlow** → `type: "redaction-structure"`, `"redaction-accroches"`, `"redaction-draft"`
- **InstagramBio** → `type: "bio-audit"`, `"bio-generator"`, `"bio"`
- **InstagramProfileNom** → `type: "instagram-nom"`
- **InstagramProfileEdito** → `type: "instagram-edito-pillars"`, `"instagram-edito-formats"`, `"instagram-rhythm-adapt"`
- **InstagramLaunch** → `type: "launch-ideas"`, `"launch-plan"`
- **ContentPlayground** → `type: "playground"`

### `creative-flow` (le flow "création guidée") — 4 steps
Appelé depuis :
- **CreerUnifie** → `step: "generate"` (streaming, le flow complet /creer)
- **use-content-generator** → `step: "generate"` + `step: "questions"` (fallback non-streaming pour post/linkedin)
- **CreerStepEdit** → `step: "adjust"` (ajustement post-génération)
- **ContentRecycling** → `step: "recycle"` (recyclage multi-format)

## Le problème concret

Pour un **même contenu LinkedIn**, deux chemins coexistent :

1. **`/creer` (CreerUnifie)** → `creative-flow` step `"generate"` avec streaming, `depthMandate` enrichi (celui qu'on vient d'améliorer avec les exemples avant/après), angles éditoriaux, questions d'approfondissement

2. **Calendrier / Express** → `generate-content` type `"calendar-quick"` ou `"express-draft"` avec `LINKEDIN_PRINCIPLES_COMPACT` + `ANTI_BROETRY_LINKEDIN` mais **sans** le `depthMandate`, **sans** angles éditoriaux, **sans** questions, et avec des prompts plus courts/génériques

Résultat : un post LinkedIn créé depuis `/creer` bénéficie de toutes les améliorations anti-broetry, tandis qu'un post créé depuis le calendrier ou les suggestions hebdo utilise un prompt plus faible.

## Origine historique

`generate-content` est la **première Edge Function** de l'app — un monolithe qui gérait tout (bios, captions, idées, etc.). `creative-flow` a été créé plus tard pour le flow guidé avec streaming, questions et angles. Mais `generate-content` n'a jamais été déprécié : il continue de servir le calendrier, les suggestions, et tous les outils Instagram (bio, nom, édito, lancement).

## Ce qui n'est PAS un problème

Les types utilitaires dans `generate-content` (bio, nom, edito, launch, playground) sont **légitimes** — ce sont des fonctionnalités différentes qui n'ont rien à voir avec la création de posts. Il ne faut pas les fusionner.

## Ce qui EST un problème

Les types `calendar-quick` et `express-draft` dans `generate-content` font **la même chose** que `creative-flow` step `"generate"` (rédiger un post/carousel/reel) mais avec des prompts inférieurs. C'est de la dette technique.

## Recommandation

Deux options :

**Option A — Aligner les prompts** (rapide, safe)
Injecter le `depthMandate` LinkedIn amélioré dans `generate-content` pour les types `calendar-quick` et `express-draft` quand le format est LinkedIn. Ça harmonise la qualité sans toucher à l'architecture.

**Option B — Migrer calendar-quick/express-draft vers creative-flow** (plus propre, plus risqué)
Faire appeler `creative-flow` par le calendrier et les suggestions, en mode non-streaming. Ça élimine la duplication mais nécessite de modifier le frontend (CalendarPostDialog, SuggestedContents) et de gérer les différences de format de réponse.

Je recommande l'**Option A** dans un premier temps — c'est safe et résout le problème de qualité immédiat. L'Option B peut venir ensuite comme refactoring planifié.


# Bug "Connexion perdue" sur le carrousel Instagram avec photos

## Diagnostic

Le message exact "Connexion perdue. Vérifie ta connexion et réessaie." vient de `src/lib/invoke-with-heartbeat.ts:60` — déclenché quand le `fetch` vers l'edge function `carousel-ai` **throw une erreur réseau qui n'est pas un AbortError** (donc pas un timeout client).

### Timeline des logs edge `carousel-ai` (heure de ton clic)

```
07:31:51  boot instance A
07:31:53  appel Anthropic Haiku, system prompt = 41 717 chars  ← photos en base64 (vision)
07:32:32  shutdown instance A          (≈ 40 s — structure_proposal OK)
07:32:57  boot instance B
07:32:58  appel Anthropic Sonnet, system prompt = 13 520 chars
07:36:17  shutdown instance B          (≈ 3 min 20 s !)
```

### Ce qui s'est passé

1. Tu cliques "carrousel" avec tes photos → 1ᵉʳ appel `carousel-ai type=structure_proposal` → Haiku analyse les photos (vision) en ~40 s. OK, tu vois la structure.
2. Tu valides la structure → 2ᵉ appel `carousel-ai type=express_full` qui **renvoie encore les photos en base64** + tout le branding + structure confirmée → Sonnet tourne plus de **3 minutes**.
3. L'infra Edge Functions coupe la connexion avant la fin (limite ≈ 150 s) → le `fetch` côté navigateur lève un `TypeError` → catch `invoke-with-heartbeat.ts` → "Connexion perdue".

Ce **n'est pas** un problème de connexion internet, ni un timeout client (qui dirait "La génération prend plus de temps que prévu"). C'est l'infra qui coupe parce que le call serveur dépasse sa limite, principalement à cause des **photos repassées une 2ᵉ fois en vision** alors que l'analyse a déjà été faite.

## Correctif

### 1. Ne pas re-envoyer les photos quand la structure est confirmée

Fichier : `src/hooks/use-content-generator.ts`, `case "carousel"` (lignes 226-256).

Quand `params.confirmedStructure` existe, **arrêter d'envoyer `photos: [...base64]` à l'edge function**. La structure confirmée contient déjà `photo_index` + `slide_type` pour chaque slide ; le rendu visuel se fait ailleurs (`carousel-visual`). Sonnet n'a plus besoin de "voir" les images pour rédiger les textes — il a la structure + `photo_description` + le contexte (`recap`) des photos.

Pseudo-diff :

```ts
photos: (!params.confirmedStructure &&
         (params.carouselType === "photo" || params.carouselType === "mix"))
        ? params.photos : undefined,
```

Effet : payload réduit de plusieurs MB → 0 ; durée Sonnet : ~3 min → ~30-40 s.

### 2. Côté serveur, prendre le chemin texte quand `confirmed_structure` est présent

Fichier : `supabase/functions/carousel-ai/index.ts`, branche `type === "express_full"` (lignes 186-220 pour le mode mix, 249-285 pour le mode photo).

Adapter la condition `if (body.photos && body.photos.length > 0)` pour qu'elle bascule sur le **mode texte** (sans vision) dès que `body.confirmed_structure` est fourni — Sonnet écrit alors les textes à partir de la structure + recap textuel des photos, sans rerunner d'analyse vision.

### 3. Message d'erreur plus juste

Fichier : `src/lib/invoke-with-heartbeat.ts:60`.

Quand `navigator.onLine === true` et que le fetch throw, on n'est probablement pas en "connexion perdue" mais en "serveur a coupé après long traitement". Remplacer par :

```
"Le serveur a mis trop de temps à répondre. Réessaie avec moins de photos
ou un sujet plus court."
```

Garder le message actuel uniquement si `navigator.onLine === false`.

## Vérification après fix

- Rejouer le scénario : photos → carrousel Instagram → structure → confirmer.
- Attendu : la 2ᵉ génération doit finir en 30-60 s (au lieu de timeout).
- Vérifier dans les logs edge : durée instance B < 90 s, pas de "shutdown" prématuré.

## Hors-scope

- Ne pas toucher à la 1ᵉʳ étape (`structure_proposal`) — elle marche, ~40 s c'est acceptable. Si on veut l'accélérer plus tard : passer en mode SSE avec streaming partiel des slides.
- Ne pas changer les modèles ni la qualité du contenu.

## Fichiers touchés

- `src/hooks/use-content-generator.ts` (case carousel express_full)
- `supabase/functions/carousel-ai/index.ts` (branche express_full avec confirmed_structure)
- `src/lib/invoke-with-heartbeat.ts` (message d'erreur réseau)

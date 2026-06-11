## Objectif
Réduire l'attente perçue sur "Voir les angles" du newsjacking **sans toucher au modèle** (on reste sur Claude Sonnet 4.5 partout pour préserver la qualité). On joue uniquement sur 3 leviers : pré-calcul en arrière-plan, prompt plus court sur la 1ʳᵉ passe, et UI à 2 étapes (1 angle instantané + bouton pour les 2 variantes).

## Principe — Flux cible

```text
                ┌─ Perplexity (actus) ──┐
Recherche ─────►│                       ├─► UI affiche actus
                └─ Sonnet (1 angle ×N) ─┘     (pré-calcul en parallèle, non-bloquant)

Click "Voir les angles" ────► angle déjà prêt = affichage instantané (0s)
                              + bouton "Voir 2 autres angles"

Click "Voir 2 autres angles" ► Sonnet (2 angles variantes) = 8-15s
```

## Détail technique

### 1. Nouvelle edge function (ou paramètre `mode` sur l'existante)
`supabase/functions/newsjacking-angles/index.ts` accepte un paramètre `mode`:
- `mode: "primary"` → renvoie **1 seul angle** (best guess), prompt court (~2500 tokens system), `max_tokens: 600`. ~3-6s avec Sonnet.
- `mode: "variants"` → renvoie **2 angles complémentaires** avec véhicules différents du primary (passé en input), prompt complet actuel, `max_tokens: 1100`. ~8-15s.
- Pas de `mode` (rétro-compat) → comportement actuel (3 angles d'un coup).

### 2. Pré-calcul pendant la recherche initiale
Dans `supabase/functions/newsjacking-ai/index.ts` (ou côté client juste après réception des actus) :
- Après que Perplexity a renvoyé les actus, déclencher en parallèle `mode: "primary"` pour les **4 premières actus visibles** (par défaut filtre "Tout").
- Lancement non-bloquant (l'utilisatrice voit déjà les actus pendant que les angles cuisent en fond).
- Limite : 4 actus pour cadrer le coût (~4 × 600 tokens out vs 1 × 1500 aujourd'hui = légèrement + cher mais raisonnable).
- Côté client : `Promise.all` qui hydrate `anglesByIdx[idx] = { data: [primaryAngle] }` au fur et à mesure.

**Choix d'implémentation à confirmer** : pré-calcul côté **client** (4 appels parallèles depuis le navigateur, plus simple, pas de changement serveur) ou **serveur** (1 seul appel serveur qui fan-out, mais alourdit la fonction de recherche). Je recommande **côté client** pour ne pas allonger l'attente initiale.

### 3. Prompt allégé pour `mode: "primary"`
Nouveau preset `CONTEXT_PRESETS.newsjacking` dans `supabase/functions/_shared/user-context.ts` :
- ✅ Garde : `prenom`, `activite`, `cible`, `combat_cause`, `combat_fights`, top 3 `piliers`, `tons` (3 axes), `mission` courte.
- ❌ Retire : `voice_description` détaillée, `key_expressions`, `persona.step_1_frustrations` longue, valeurs détaillées, `tone_style`/`tone_level` (gardés seulement comme labels courts).
- Estimation : 7500 → 2500 tokens.

Le `mode: "variants"` garde le preset `content` actuel (qualité max sur les variantes que l'utilisatrice consulte vraiment quand elle veut creuser).

### 4. UI côté `NewsjackingPanel.tsx`
- État `anglesByIdx[idx]` enrichi : `{ primary: Angle | null, variants: Angle[] | null, loadingPrimary, loadingVariants, ... }`.
- À l'expand de l'actu :
  - Si `primary` est déjà là (pré-calculé) → affichage immédiat + bouton **"Voir 2 autres angles"** (compact, sous l'angle primary).
  - Si `primary` est en cours de pré-calcul → spinner discret "1ʳᵉ idée en route…" (généralement < 1s d'attente vu qu'on a déjà commencé pendant la recherche).
  - Si `primary` n'a pas été pré-calculé (5ᵉ actu ou plus, ou hidden levée) → lancer `mode: "primary"` au clic.
- Click sur **"Voir 2 autres angles"** → appel `mode: "variants"` en passant le `vehicule` du primary pour éviter les doublons + spinner ciblé. Streaming optionnel ici (V2, pas bloquant).
- Click **"Choisir cet angle"** → comportement inchangé.

### 5. Garde-fous
- Pré-calcul **désactivé** si l'utilisatrice arrive avec un cache d'actus déjà chargé (évite double facturation au refresh).
- Quota `content` consommé **uniquement quand un angle est effectivement affiché** (les variantes au clic). Le primary pré-calculé compte aussi (sinon abus possible) mais on s'autorise un cap léger côté serveur.
- Si pré-calcul échoue silencieusement → fallback au comportement actuel (1 seul appel 3-angles au clic). Aucune régression possible.

## Ce qu'on ne change PAS
- Modèle : reste **Claude Sonnet 4.5** sur les 2 modes. Aucun risque qualité.
- Recherche d'actus Perplexity + brand universe Opus : intactes.
- Structure des angles, véhicules, anti-fabrication, format de réponse : intacts.

## Estimations
| Étape | Avant | Après |
|---|---|---|
| Voir les angles (actu 1-4) | 15-45s | **0-2s** (pré-calculé) puis 8-15s si l'utilisatrice veut + |
| Voir les angles (actu 5+) | 15-45s | 5-10s (mode primary, prompt court) puis 8-15s si + |
| Coût tokens / recherche | 1 actu explorée = 1 appel Sonnet | 4 actus pré-cal + variantes à la demande ≈ 2-3× coût si l'utilisatrice explore plusieurs actus, ~4× si elle en ouvre qu'une (acceptable vu le gain UX) |

## Plan de validation
1. Vérifier qu'à la fin de la recherche, les 4 premières actus ont un angle primary sous 8-12s en arrière-plan (logs console).
2. Vérifier qu'au clic sur actu 1 immédiatement après la recherche, l'angle s'affiche instantanément.
3. Vérifier que "Voir 2 autres angles" ne re-génère pas le primary et donne 2 véhicules différents.
4. Vérifier qu'une 5ᵉ actu ouverte tombe bien sur le fallback `mode: "primary"` (pas un timeout 3-angles).
5. Vérifier qu'aucun crédit n'est consommé en double sur un re-expand.
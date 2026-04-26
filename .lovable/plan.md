## Objectif
Diviser par **2 à 3** le temps de réponse de "Aide-moi à trouver une idée" (de ~30-45s à ~10-15s) sans dégrader la qualité des 3 idées proposées.

## Diagnostic
La lenteur vient de **3 facteurs cumulés** dans `supabase/functions/content-coaching/index.ts` :
1. **Modèle Opus** (`claude-opus-4-6`) alors que tout le reste de la génération de contenu (caption, carousel, reels, suggestion, …) utilise déjà Sonnet avec une excellente qualité.
2. **Prompt système ~14 000 tokens** : beaucoup de redondance pédagogique (13 angles listés + 3 structures hooks + 5 étapes de méthode + bloc EMBEDDED_EDUCATION de 10 000 caractères + 2 creative seeds + …).
3. **Historique large** : 20 posts calendrier + 20 carousels générés injectés à chaque appel.

## Changements proposés

### 1. Passer à Sonnet (gain de latence majeur)
Dans `supabase/functions/content-coaching/index.ts` ligne 480, remplacer :
```ts
getModelForAction("coaching")  // claude-opus-4-6
```
par :
```ts
getModelForAction("coaching_light")  // claude-sonnet-4-5
```
**Justification** : la clé `coaching_light` existe déjà dans `_shared/anthropic.ts` exactement pour ce cas. Sonnet 4.5 est le modèle utilisé pour TOUTE la rédaction de contenu du projet (carousels, reels, captions, suggestions). Un coaching d'idées en JSON structuré est largement dans ses capacités.

### 2. Compresser le prompt système (~ -60%)
Réduire le prompt en gardant les **règles non négociables** (anti-TU, ancrage métier, test du screenshot, anti-patterns) et en supprimant :
- Les répétitions entre "ÉTAPE 0", "ÉTAPE 1", … "ÉTAPE 5" (regrouper en une checklist concise)
- La liste exhaustive des 13 angles éditoriaux → garder 6 angles essentiels + "ou un autre angle pertinent"
- Les blocs format-spécifiques (Reel/Story/Pinterest visual) : garder seulement 5 lignes par format au lieu de 20
- Le bloc `EMBEDDED_EDUCATION` complet : remplacer par un résumé de 5 lignes du concept "BUG CRÉATIF / VÉHICULE 5", uniquement quand pertinent
- La double mention "ROUTES" qui répète les redirect_route
- Les sous-titres décoratifs `══════` (économisent ~500 caractères)

Cible : passer de ~14 000 tokens à ~5 000 tokens en entrée.

### 3. Réduire l'historique de 20 → 8
Lignes 144 et 153 : limiter à `limit(8)` au lieu de `limit(20)`. Le but de l'historique est d'éviter les répétitions récentes — 8 posts récents suffisent largement.

### 4. Réduire `max_tokens` de 2500 → 1800
Le JSON de sortie (3 idées avec subject/hook/angle/why_it_works/brief) tient confortablement dans 1500 tokens. Couper à 1800 laisse une marge de sécurité tout en accélérant la fin de génération.

### 5. (Optionnel) Garder les LoadingMessage actuels
Le composant `LoadingMessage` qui fait défiler des messages toutes les 3,5s est déjà bien — pas besoin d'y toucher. Avec le gain de vitesse, l'utilisatrice verra peut-être seulement 2 messages au lieu de 5, ce qui est exactement le but.

## Fichiers modifiés
- `supabase/functions/content-coaching/index.ts` (modèle, prompt système compacté, limites historique, max_tokens)

## Garde-fous qualité
- On garde **toutes les règles d'ancrage métier** (la règle la plus importante)
- On garde **les anti-patterns** ("Il y a 2 types de…", "Et personne n'en parle", etc.)
- On garde **la règle anti-TU** sur les hooks
- On garde **les seeds créatifs aléatoires** pour la variété entre sessions
- On garde **l'historique** pour éviter les répétitions (juste réduit de 20 → 8 par source)
- On garde **les instructions spécifiques par format** (Reel/Story/Pinterest) en version condensée

## Test rapide après déploiement
Faire 2-3 essais sur la page Créer en cliquant "Aide-moi à trouver une idée" → vérifier que :
- Le temps de réponse est passé de ~30s à ~10-15s
- Les 3 idées restent ancrées dans le branding (pas de retour en idées génériques sur la "communication")
- Les hooks ne reprennent pas les formules interdites
- L'historique récent n'est pas reproposé
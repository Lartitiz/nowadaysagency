

## Le bouton "Compléter avec l'IA" ne fait rien sur la fiche persona de Marion

### Diagnostic confirmé en base

Marion a bien une fiche persona, mais **7 champs sont vides** (objections, clichés, beau, inspirant, repoussant, ressenti, actions). Ils étaient juste pas remplis pendant son onboarding.

Pour que le bouton "Compléter les 7 champs manquants avec l'IA" fonctionne, le code actuel a besoin d'une **de ces deux sources** comme contexte :

| Source attendue | État chez Marion |
|---|---|
| `persona.portrait` (synthèse JSON) | ❌ vide (`null`) |
| `branding_coaching_sessions` section `persona` | ❌ aucune ligne en base |

Donc la condition à la ligne 256 du fichier `BrandingFicheCards.tsx` :
```ts
if (conversationMessages.length > 0 || portrait) { ... appel IA ... }
```
est **fausse**. Le call IA est purement et simplement skippé. Le toast "Fiche complétée par l'IA !" s'affiche mais **aucune IA n'a tourné**. C'est le bug que tu vois.

Pendant ce temps, Marion a en base **tout le contexte qu'il faut** pour qu'une IA déduise ces 7 champs : `target_description` (331 char), `target_verbatims` (259), `mission`, `positioning`, `voice_description`, `target_problem`, `target_beliefs`. Il suffit de les passer comme contexte au prompt.

### Ce qu'on corrige

#### 1. Ajouter un fallback "branding context" dans `handleAutoFill`

Fichier : `src/components/branding/BrandingFicheCards.tsx`, fonction `handleAutoFill`, autour des lignes 248-298.

- Avant l'appel IA, fetcher `brand_profile` (champs cible + ton + mission + positioning) **en plus** des sources actuelles.
- Construire un bloc de contexte enrichi à passer à l'IA, qui contient :
  - le portrait (s'il existe)
  - la conversation coaching (si elle existe)
  - **les champs `brand_profile` pertinents** (toujours dispo dès qu'il y a un branding rempli)
  - les champs persona déjà remplis (frustrations + transformation chez Marion)
- **Toujours appeler l'IA** dès qu'au moins une de ces sources contient quelque chose (et pas seulement portrait/conversation).

#### 2. Élargir la condition d'appel

Remplacer :
```ts
if (conversationMessages.length > 0 || portrait) { ... }
```
par une condition basée sur la présence d'**au moins une source de contexte** (incluant `brand_profile` et persona partiellement rempli). Concrètement : si on a `target_description` OU `target_verbatims` OU `portrait` OU une conversation OU du persona déjà rempli → on appelle l'IA.

#### 3. Améliorer le retour utilisateur

Aujourd'hui le toast dit "Fiche complétée" même si zéro champ a été rempli. À corriger :

- compter le nombre de champs effectivement remplis par l'étape portrait + l'étape IA
- toast "X champ(s) complété(s) par l'IA ✨" si > 0
- toast `info` "Pas assez de contexte pour compléter automatiquement — remplis manuellement quelques champs ou refais le coaching persona" si 0

#### 4. Adapter le prompt côté edge function

Fichier : `supabase/functions/branding-coaching/index.ts`, branche `section === "persona_fill"` (lignes 401-457).

- Le prompt actuel suppose qu'on a "toute la conversation". Le rendre tolérant à des sources mixtes (portrait + brand_profile + persona partiel + conversation, dans n'importe quelle combinaison).
- Ajouter explicitement dans le system prompt : "Tu peux et tu DOIS déduire à partir de la cible, des verbatims, de la mission et du ton si la conversation est absente. Ne refuse jamais sous prétexte de manque d'info — déduis."

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/components/branding/BrandingFicheCards.tsx` | `handleAutoFill` : fetch `brand_profile`, contexte enrichi, condition élargie, toast honnête |
| `supabase/functions/branding-coaching/index.ts` | Branche `persona_fill` : prompt plus tolérant, instruction de déduction obligatoire |

### Validation

1. Sur l'espace de Marion, cliquer "Compléter les 7 champs manquants avec l'IA" → l'IA tourne réellement, les 7 champs (objections, clichés, beau, inspirant, repoussant, ressenti, actions) sont remplis à partir de son `brand_profile`.
2. Toast "7 champs complétés par l'IA ✨" si tout passe, ou un compte précis si certains champs n'ont pas pu être déduits.
3. Sur un compte qui n'a vraiment rien rempli → toast info clair "Pas assez de contexte" au lieu d'un faux succès.
4. Sur un compte qui a déjà fait le coaching conversationnel → comportement actuel préservé (la conversation prime).

### Risque

Faible. On ajoute un fetch + on élargit une condition + on change un prompt. Aucune migration DB. Le pire cas reste l'ancien comportement (rien ne se passe), donc pas de régression possible.


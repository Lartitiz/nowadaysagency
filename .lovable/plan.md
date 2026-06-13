## Problème

Le carrousel PHOTO pur ignore le canal : prompt système hardcodé "Instagram", message user qui dit littéralement "carrousel photo Instagram" même sur LinkedIn, légende avec hashtags Instagram obligatoires. Le mode MIX a déjà résolu ça via un `channelBlock` + paramètre `isLinkedIn`.

## Fichier impacté

`supabase/functions/carousel-ai/index.ts` uniquement.

## (a) Modifications demandées

### 1. Signature `buildPhotoCarouselPrompt` (ligne 1531)

```ts
function buildPhotoCarouselPrompt(body: any, isLinkedIn: boolean = false): string
```

Défaut `false` → Instagram strictement inchangé.

### 2. Appel dans la branche photo (ligne 250)

```ts
const photoPrompt = buildPhotoCarouselPrompt(body, isLinkedIn);
```

`isLinkedIn` est déjà calculé en haut du handler (ligne 100).

### 3. Dé-hardcoder "Instagram" dans le message user vision (ligne 261)

```ts
text: `Voici ${body.photos.length} photo(s) pour un carrousel photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.…`
```

Vérifier qu'aucun autre "Instagram" hardcodé ne subsiste dans le chemin vision ni dans le chemin text-only de la branche photo (le chemin text-only n'en contient pas aujourd'hui — confirmé).

### 4. Bloc d'adaptation LinkedIn dans `buildPhotoCarouselPrompt`

Transposer le `channelBlock` du mix au photo, en respectant les spécificités photo (overlays, progression visuelle) :

```ts
const channelBlock = isLinkedIn
  ? `═══ ADAPTATION LINKEDIN (OBLIGATOIRE) ═══

Ce carrousel photo est destiné à LinkedIn (PDF natif posté comme document), pas à Instagram. Tu DOIS adapter ton, overlays et légende :

- TON : professionnel mais chaleureux, expert·e mais accessible. Vouvoiement par défaut (sauf si la voix de marque dit le contraire).
- OVERLAYS : sobres, factuels, ancrés dans l'expertise / la leçon métier / le retour terrain. Pas de "vibe" pure ni d'emojis fleurs/cœurs (✨🌸💖). 0-1 emoji max par slide. On privilégie le "narratif" et le "technique" au "sensoriel" pur.
- ARC : photo terrain → analyse / mécanisme / chiffre → preuve ou leçon → ouverture pro (échange, retour d'expérience).
- LÉGENDE : "vous" plutôt que "tu", pas d'emojis décoratifs, hashtags professionnels (secteur, métier, thématique pro) — pas de hashtags lifestyle Instagram.

`
  : "";
```

Injecter `${channelBlock}` juste après `${confirmedStructureBlock}` dans le `return` final (ligne 1584), exactement comme le mix le fait ligne 1768.

Adapter aussi la phrase de rôle :

```
…spécialisée dans les carrousels photo ${isLinkedIn ? "LinkedIn" : "Instagram"}.
```

### 5. Légende conditionnelle (bloc ligne 1652-1659)

Aligner sur le mix (ligne 1910) :

- Sur Instagram (`!isLinkedIn`) : bloc actuel inchangé (hook + body + CTA + 5-10 hashtags).
- Sur LinkedIn (`isLinkedIn`) : légende OPTIONNELLE, ton "vous", pas de hashtags Instagram. Hashtags pro autorisés mais non requis ; CTA pro ("Votre avis en commentaire ?", "Partagez si cela résonne").

Schéma JSON de sortie : le bloc `caption` reste présent dans les deux cas (champs identiques), mais sur LinkedIn `hashtags` peut être un tableau vide ou contenir des hashtags pro.

## (b) Propositions optionnelles — à valider individuellement - oui pour tout

- **P1 — Ajuster aussi la mention "vit seule sur Instagram" (ligne 1633)** en `${isLinkedIn ? "LinkedIn" : "Instagram"}`. Cosmétique mais évite une incohérence visible si on relit le prompt. **Reco : appliquer.**
- **P2 — Adapter le CTA d'exemple ligne 1658** ("Et toi, tu as déjà ressenti ça ?") avec une variante "vous" sur LinkedIn. **Reco : appliquer**, c'est dans le périmètre légende.
- **P3 — Ajuster les rôles de slides (ligne 1644-1650)** pour ajouter un rôle "preuve" / "leçon" côté LinkedIn. **Reco : NE PAS appliquer** — hors périmètre, les rôles actuels (`hook_visuel`, `detail`, `contexte`, `process`, `emotion`, `cta_visuel`) fonctionnent sur les deux canaux.

## Ce qui ne bouge pas

- Comportement Instagram (`isLinkedIn=false` → prompt strictement identique à aujourd'hui).
- `buildMixCarouselPrompt`, `buildMixCarouselNewsReactionPrompt`, `buildExpressFullPrompt`.
- Bloc `confirmedStructureBlock` (narrative_thread / story_beat / visual_anchor).
- Garde-fou anti-description photo, routage vision/text-only, latence, correction pass, quota, workspace, choix du modèle.
- Frontend (le canal `linkedin` est déjà transmis via `body.channel`).

## Validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Test manuel Instagram : carrousel photo → légende + hashtags présents, ton inchangé.
- Test manuel LinkedIn : carrousel photo → vouvoiement, pas de hashtags lifestyle, message user mentionne "LinkedIn".
- `grep -n "Instagram"` dans la branche photo et `buildPhotoCarouselPrompt` : aucune occurrence hardcodée restante quand `isLinkedIn=true`.

## Hors scope

- Harmonisation du chaînage dans `buildMixCarouselNewsReactionPrompt`.
- Harmonisation des fourchettes de longueur d'overlay (5-15 / 5-20 / 5-25).
- UI de sélection du canal.
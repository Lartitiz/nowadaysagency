# Pertinence des suggestions typo — étapes 1 à 4

Travail itératif. Chaque étape est livrable indépendamment, on valide après chaque tour.

## Étape 1 — Enrichir le prompt step 4 + mapping sectoriel typo + validation

**Fichier** : `supabase/functions/charter-coaching/index.ts`

1. Ajouter un dict `SECTOR_FONTS` (jumeau de `SECTOR_PALETTES`) : 7 secteurs → 1-2 duos typo recommandés. Exemples :
   - photographe → Cormorant Garamond + Inter / Playfair + Work Sans (épuré, laisse parler les images)
   - mode éthique → Cormorant + Raleway / Lora + Nunito (artisanal-doux)
   - coach business → Space Grotesk + Inter / Montserrat + Open Sans (affirmé)
   - bien-être, artisan, food, default…
2. Helper `getSectorFontAdvice(typeActivite)` symétrique à `getSectorAdvice`.
3. Constante `ALLOWED_FONTS` (les 15 fonts du prompt) + helper `normalizeFont(name)` qui retourne la version canonique si match case-insensitive, sinon `null`.
4. **Récrire le prompt step 4** :
   - Injecter le conseil sectoriel typo.
   - Injecter `charterData.mood_keywords`, `charterData.photo_style`, `charterData.color_primary` si présents (récoltés aux steps 1-3 du même coaching).
   - Conserver le bloc `fontAdvice` basé sur ton, mais l'enrichir : mentionner que les mood_keywords visuels prennent priorité sur les défauts sectoriels.
   - Demander à Claude de **justifier son choix en 1 phrase** dans `extracted.font_rationale` (utile debug + futurement affichage UI).
5. Après réception, dans le handler : `normalizeFont(extracted.font_title)` + `normalizeFont(extracted.font_body)` → si l'un est `null`, retomber sur le 1er duo de `SECTOR_FONTS[secteur]` plutôt que de sauvegarder une font qui ne chargera pas.

**Aucun changement client ni DB.** Test : passer le coaching jusqu'au step 4 avec un compte photographe + mood "minimaliste épuré" → la suggestion doit être un duo épuré (Cormorant/Inter), pas un Playfair lourd.

## Étape 2 — Brancher `FONT_COMBOS` dans la section typo

**Fichier** : `src/components/branding/charter/CharterTypographySection.tsx`

1. Utiliser la prop `toneKeywords` (déjà reçue, ignorée) pour filtrer `FONT_COMBOS` : matcher les `tone_match` ↔ keywords. Garder le top 3.
2. Si aucun keyword (cas vide), afficher les 3 combos les plus universels (Moderne & Clean, Chaleureux & Accessible, Classique Élégant).
3. Ajouter un bloc « 💡 Suggestions adaptées à ton ton » sous les inputs : 3 cards cliquables avec aperçu visuel (titre dans `font_title`, body dans `font_body`), description courte. Clic → `onDataChange({ font_title, font_body })` + `loadGoogleFont()`.
4. Vérifier que `BrandCharterPage` passe bien `toneKeywords` (à confirmer ligne ~735).

## Étape 3 (optionnelle, à valider après les 2 premières)

- Synchroniser les 100 fonts de `GOOGLE_FONTS_LIST` avec les 15 du prompt edge — décider : soit étendre le prompt à 30+ fonts, soit restreindre l'autocomplete aux 15 sûres, soit ajouter une marque visuelle « recommandée par l'IA » sur les 15.
- Afficher la `font_rationale` retournée par l'IA dans une mini-bulle sous le duo.

## Hors scope

- Refonte du flow de coaching (ordre, nombre de steps).
- Coaching audio/vocal.
- Génération de specimens PDF de la typo.

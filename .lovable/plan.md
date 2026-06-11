# Plan — Chaînage narratif du carrousel MIX

Périmètre strict : `supabase/functions/carousel-ai/index.ts`, deux zones uniquement (buildMixCarouselPrompt + branche MIX de `photoInstruction` dans `structure_proposal`). Le mode photo, le news-reaction mix, le channelBlock LinkedIn, le schéma JSON, la composition (50% photos, photo_full en slide 1, text_only CTA, pas de 3 du même type), le DEPTH_LAYER, la correction pass et tout le frontend ne bougent pas.

## (a) Demandé

### 1. `buildMixCarouselPrompt` — nouveau bloc "CHAÎNAGE NARRATIF DES OVERLAYS"
Insérer JUSTE APRÈS le bloc "═══ RÈGLES SPÉCIFIQUES MIX ═══" (avant l'actuel "INTERDICTION CASCADE", ligne ~1827), un bloc calqué sur celui du mode photo (ligne ~1600) mais adapté au mix :
- Les `overlay_text` des slides `photo_full` lus à la suite = UN SEUL mini-récit (reprend / prolonge / fait basculer la slide précédente, qu'elle soit photo OU texte).
- À partir de la slide 2, chaque overlay photo_full DOIT contenir soit (a) un connecteur narratif ("Puis", "Et puis", "Sauf que", "C'est là que", "Alors", "Trois mois plus tard", "Au début", "Maintenant", "Résultat"…), soit (b) une reprise lexicale d'un mot-clé de la slide précédente.
- Les `text_only` participent au récit : ouverture qui reprend/prolonge la slide photo précédente, développement en profondeur, dernière phrase qui TEND vers la suivante (ouvre la question/tension que la photo suivante va incarner).
- Test de permutation : si on échange deux slides au hasard et que ça marche encore → raté.

### 2. `buildMixCarouselPrompt` — réécrire "INTERDICTION CASCADE / ESCALIER" (ligne ~1828)
- SUPPRIMER la puce "Test slide-seule : chaque slide texte doit pouvoir être lue HORS contexte…".
- AJOUTER à la place un "Test de progression" : chaque slide texte APPORTE un élément nouveau (fait, scène, donnée, mécanisme, bascule) par rapport à la précédente. Si elle reformule la même idée avec d'autres mots ou plus d'intensité → cascade → fusionner ou réécrire.
- ASSOUPLIR la puce sur les connecteurs d'ouverture : un connecteur narratif en ouverture d'une slide texte est AUTORISÉ s'il introduit un contenu nouveau (scène, fait, donnée). Il reste INTERDIT s'il introduit une reformulation amplifiée.
- CONSERVER intactes : la puce "même mot-clé central interdit entre deux slides texte consécutives", la rampe émotionnelle ("important → crucial → vital") interdite, et la règle Anti-TU.

### 3. `buildMixCarouselPrompt` — "VÉRIFICATION FINALE" (ligne ~1848)
Ajouter deux puces à la fin de la checklist (avant la puce `isLinkedIn`) :
- "Les overlays photo_full lus à la suite forment un récit continu (reprise / prolongement / bascule), pas une galerie de légendes."
- "Le test de permutation échoue : déplacer une slide casserait le récit."

### 4. `structure_proposal` — branche MIX de `photoInstruction` (ligne ~351-377)
Ajouter à la fin du template literal MIX un bloc "CHAÎNAGE NARRATIF (CRITIQUE)" équivalent à celui de la branche PHOTO (ligne 345) :
- Les `title_suggestion` lus dans l'ordre racontent une histoire qui progresse (situation → tension → bascule → résolution → ouverture).
- Chaque `strategic_note` dit ce que la slide FAIT AVANCER dans le récit (pas seulement pourquoi elle est à cette position).
- Test de permutation rappelé.

## (b) Mes propositions (à valider individuellement)

Aucune. La lecture des deux zones confirme que le plan demandé couvre exactement la cause identifiée (overlays sans règle de chaînage + "test slide-seule" qui interdit la continuité). Les autres blocs MIX (composition, profondeur, photo assignment, channelBlock LinkedIn) sont déjà cohérents et hors causalité — y toucher serait du scope creep.

## Validation
- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Test manuel : générer un carrousel mix 2-3 photos, sujet narratif → overlays se lisent comme un récit ; slides texte enchaînées aux photos ; pas de paraphrase amplifiée ; densité texte préservée (mécanisme/donnée/bascule).
- Test LinkedIn mix : channelBlock toujours appliqué (ton, CTA pro).

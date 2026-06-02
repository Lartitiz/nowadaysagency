## Diagnostic

J'ai tracé le flux exact pour un post LinkedIn avec photos.

**Ce qui est envoyé au modèle** (depuis `CreerUnifie.tsx`) :
- `context` = ton texte "De quoi tu veux parler ?" (ex : *"j'ai co-créé La Prochaine Aire et je m'occupe de la com"*)
- `photo_description` = le bloc "décris tes photos en quelques mots" (souvent vide maintenant qu'on l'a caché)
- `photos[]` = les 4 images + leur contexte par photo

**Étape `questions`** (`supabase/functions/_shared/vision-prompts.ts`) :
- Ton sujet est injecté comme une simple ligne : `Sujet : "${context}"`
- Mais les **consignes dominantes** forcent l'ancrage image : *"Chaque question doit citer un détail concret VU sur une photo PRÉCISE"*, *"INTERDIT de poser les 3 questions sur la même photo"*, *"Ton PRO : ce qu'on apprend pro derrière l'image"*.
- Résultat : les 3 questions partent des photos, pas de ton sujet. Ton "je veux parler de co-création + récits désirables" est noyé.

**Étape `generate`** (`supabase/functions/creative-flow/index.ts` ligne 1327) :
- Le prompt n'injecte **QUE** `photo_description` — pas `context`.
- Donc ton sujet déclaré au tout début disparaît littéralement du prompt de rédaction. Le modèle se rabat sur les photos + tes réponses aux 3 questions (elles-mêmes biaisées photo).
- C'est pour ça qu'il sort un post centré sur "Aire You Ready / récits désirables / com pas austère" (ce qu'il voit sur le flyer) au lieu de "j'ai co-créé ce lieu et j'en fais la com".

## Plan

Deux fichiers à modifier, uniquement sur le chemin **photo + LinkedIn** (pour ne rien casser ailleurs).

### 1. `supabase/functions/_shared/vision-prompts.ts` — `buildVisionQuestionsPrompt`

Repositionner le sujet utilisatrice comme **boussole prioritaire** des questions :

- Ajouter un bloc en tête de prompt (avant les règles d'ancrage image) :
  ```
  ══ SUJET PRIORITAIRE DE L'UTILISATRICE ══
  "${context}"
  C'est CE sujet qu'elle veut traiter. Les photos sont des illustrations, pas le sujet.
  Tes 3 questions doivent l'aider à creuser CE sujet — pas à décrire les photos.
  ```
- Assouplir la règle d'ancrage : les questions peuvent (mais ne doivent plus obligatoirement) citer une photo précise. Remplacer *"Chaque question doit citer un détail concret VU sur une photo précise"* par *"Au moins 1 des 3 questions peut s'appuyer sur un détail visible. Les autres approfondissent le sujet déclaré."*
- Retirer le *"INTERDIT de poser les 3 questions sur la même photo"* (qui force la dispersion).
- Garder la consigne canal LinkedIn mais la subordonner au sujet : *"Angle PRO sur LE sujet qu'elle veut traiter, pas sur ce qu'on voit."*

### 2. `supabase/functions/creative-flow/index.ts` — branche `step === "generate" && photo_mode` (lignes 1255-1338)

Injecter `context` dans le prompt de génération, avec **priorité maximale** :

- Construire en tête du dernier `text` block (avant `formatBrief`) :
  ```
  ══ SUJET DÉCLARÉ PAR L'UTILISATRICE (PRIORITÉ ABSOLUE) ══
  "${context}"
  
  C'est CE sujet que le post doit traiter. Les photos illustrent / appuient, elles ne dictent PAS l'angle.
  Si une photo te suggère un angle différent de ce sujet, ignore-le et reste sur le sujet déclaré.
  ```
- Garder `photo_description` ensuite, mais le requalifier : *"Description complémentaire des photos (contexte secondaire)"*.
- Garder le bloc `answersBlockPhoto` mais ajouter : *"Ces réponses servent à enrichir LE sujet ci-dessus, pas à le remplacer."*
- Conserver toutes les règles anti-fabrication, anti-cascade, anti-désignation d'image existantes.

### Ce qui ne change pas

- Le flux UI (ordre photos → sujet) reste inchangé.
- Le chemin texte (non-photo), Instagram, Reels, Stories, Newsletter, carrousels : aucun changement.
- Les règles anti-slop et la passe de correction LinkedIn restent identiques.

## Effet attendu

Avec ton input *"j'ai co-créé La Prochaine Aire et je m'occupe de la com / récits désirables"* + tes 4 photos :
- **Questions** : 1 sur la co-création (pourquoi ce lieu, ton rôle), 1 sur ta vision des récits désirables, 1 qui peut s'appuyer sur une photo (ex. l'événement Aire You Ready) — au lieu des 3 actuelles sur photos.
- **Post généré** : centré sur ton histoire (co-créatrice + responsable com), les photos servent d'illustration, plus de dérive vers "communication pas austère" si ce n'est pas ton angle.

## Audit des posts LinkedIn générés depuis photo(s)

### Constats

**1. Le modèle écrit "Photo 1", "Photo 2"… dans le post final.**
Cause : dans `creative-flow/index.ts` (l.1264-1282), on injecte un label texte `↑ Photo 1/4`, `↑ Photo 2/4`… juste après chaque image envoyée à Claude. Le modèle apprend de ce qu'il voit dans le prompt et reproduit ce phrasé dans la sortie. La contre-instruction "évite 'photo 1 : photo 2 :'" arrive 30 lignes plus bas, noyée. Elle perd contre l'amorçage visuel.

**2. Le post tutoie ("tu") au lieu de vouvoyer ("vous").**
Cause : le brief LinkedIn (`vision-prompts.ts:100`) dit juste "Ton pro mais incarné" sans imposer le vouvoiement. Le system prompt global et le ton par défaut du projet sont en "tu" (Instagram, coach). LinkedIn FR pro = "vous" par défaut → il faut le préciser explicitement.

**3. Trop de texte, pont image↔texte faible, peu de profondeur.**

- Brief actuel : "1300-2000 caractères" → trop long, conflit avec la mémoire projet (1300-1700).
- Le pont est décrit en une demi-phrase floue : "L'image illustre un point précis du texte (ne pas la paraphraser)". Pas de règle concrète sur OÙ et COMMENT le pont apparaît.
- Structure "hook → apprentissage → invitation à réagir" très convenue, pousse vers le post LinkedIn générique.

**4. Multi-photos : le post devient un photo-by-photo descriptif.**

- En mode série, on injecte `↑ Photo 1/4`, `↑ Photo 2/4`… ce qui pousse au listing.
- Le `modeInstr` série suggère trop de structures narratives ("J1, J2, J3", "étape 1, 2, 3") qui mènent à l'énumération.
- Le brief ne dit pas clairement : **un seul fil thématique commun, un seul message, les photos sont des angles d'un même sujet**.

---

## Plan

Deux fichiers touchés. Aucune modif DB, aucune modif UI.

### 1. `supabase/functions/_shared/vision-prompts.ts` — refondre le brief LinkedIn

Réécrire l'entrée `if (ctype.includes("linkedin"))` de `buildVisionGenerateBrief` :

```
Rédige un POST LINKEDIN ancré dans la/les photo(s).

LONGUEUR : 900-1400 caractères (plus court = mieux ; on coupe ce qui n'apporte rien).

ADRESSE : VOUS (vouvoiement). Jamais "tu", jamais "toi".

STRUCTURE EN 3 TEMPS (sans titres, sans bullet) :
1. ACCROCHE (1-2 lignes) : une phrase qui se tient SEULE, lisible sans voir l'image,
   qui crée la tension ou la surprise. Pas de question rhétorique. Pas de "Aujourd'hui,
   je voulais vous parler de…".
2. PONT IMAGE↔TEXTE (1 ligne, max 2) : une phrase qui fait un lien CONCRET avec ce
   qu'on voit, sans paraphraser ("Sur cette photo, X" est interdit). 
3. MESSAGE (le reste) : UNE seule idée pro, prise de position assumée, ou
   apprentissage concret. Pas de liste, pas de "3 leçons", pas de bullets.

INTERDITS :
- "Photo 1", "Photo 2", "sur la première photo", "comme vous pouvez le voir"
- Décrire les photos une par une
- Punchline marketing fabriquée ("Et si je vous disais que…", "Spoiler :")
- Phrases-listes parallèles ("Pas X. Pas Y. C'est Z.")
- Hook question fermée ("Vous saviez que… ?")

FIN : pas de CTA explicite type "Et vous, qu'en pensez-vous ?". Laisser une phrase
ouverte qui invite naturellement à réagir, ou couper net.
```

### 2. `supabase/functions/creative-flow/index.ts` — supprimer la pollution "Photo X/N"

Réécrire le bloc l.1263-1294 :

- **Single (1 photo)** : ne pas injecter de label texte du tout (juste l'image, et le contexte par photo s'il existe).
- **Before/after (2 photos)** : garder le label car c'est sémantique (`↑ AVANT` / `↑ APRÈS`, sans "Photo 1/2").
- **Série (3+ photos)** : **ne plus injecter de label numéroté**. Juste les images les unes après les autres. Le contexte par photo s'affiche uniquement s'il a été fourni (sans numéro).
- Réécrire `modeInstr` série en une consigne courte et tranchée :
  ```
  Ces N photos traitent d'UN MÊME sujet. Trouve le fil thématique commun
  et écris UN SEUL message qui s'appuie sur l'ensemble. NE liste PAS les
  photos. NE numérote PAS. Si tu n'identifies pas de fil commun clair,
  reste sur l'observation la plus universelle qui les relie.
  ```
- Réécrire `modeInstr` before/after sans changement de fond, juste plus concis.

### 3. Aligner la longueur sur la mémoire projet

Brief LinkedIn aligné sur 900-1400 caractères (la mémoire dit 1300-1700 pour LinkedIn en général, mais les posts photo gagnent à être plus courts car l'image porte une partie de la charge). On documente l'écart dans un commentaire pour ne pas se contredire.

---

## Ce qu'on ne touche PAS

- `vision-prompts.ts` → `buildVisionQuestionsPrompt` : il garde "Photo 1, Photo 2" car c'est utile pour les **questions** posées à l'utilisatrice ("sur la photo 3, on voit…"). Le problème n'existe que côté **génération**.
- Les autres formats (Instagram, Reel, Stories, Newsletter) : pas touchés.
- L'UI, la DB, le contrat de l'edge function : inchangés.

## Fichiers touchés

- `supabase/functions/_shared/vision-prompts.ts` (brief LinkedIn dans `buildVisionGenerateBrief`)
- `supabase/functions/creative-flow/index.ts` (l.1263-1294 : suppression labels + réécriture `modeInstr`)

## Vérification

1. Générer un post LinkedIn depuis 1 photo → vérifier "vous", longueur 900-1400, pas de "Sur cette photo".
2. Générer depuis 3-4 photos → vérifier un seul message thématique, aucun "Photo 1/2/3", pas d'énumération.
3. Générer un avant/après (2 photos) → vérifier que la transformation est racontée comme un récit, pas comme deux descriptions.

## Mémoire à mettre à jour après validation

Ajouter dans `mem://preference/linkedin` :

- Posts photo : 900-1400 caractères (vs 1300-1700 texte pur).
- LinkedIn = "vous" (à confirmer avec l'utilisatrice, défaut projet aujourd'hui = "tu").
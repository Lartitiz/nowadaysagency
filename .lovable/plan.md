## Audit des incohérences de libellés

Tour des écrans Idée → Format → sous-modes. Voici ce qui doit être recalibré pour éviter de promettre/cacher des choses.

### 1. Descriptions des canaux — `CreerStepFormat.tsx` lignes 22-27

| Canal | Avant | Après |
|---|---|---|
| Instagram | "Carrousel, Reel, Story, Post" | inchangé |
| **LinkedIn** | "Post texte professionnel" | **"Post ou carrousel"** |
| **Pinterest** | "Épingle texte ou visuelle" | **"Épingle texte, visuelle ou inspirée"** |
| **Newsletter** | "Email long format" | **"Email 1500-2500 mots"** |

**Pourquoi** : LinkedIn propose 3 sous-modes (Post texte, Carrousel texte, Carrousel mixte) — la desc actuelle est mensongère. Pinterest a 3 sous-modes (Texte, Visuel, Inspiration) — "Inspiration" est oubliée. Newsletter "long format" est vague.

### 2. Sous-mode LinkedIn "Post texte" — ligne 393

- **Label** : `"Post texte"` → **`"Post"`** (l'utilisateur peut y attacher une photo via le toggle plus loin → "texte" est trompeur)
- **Desc** : `"1300-2000 caractères"` → **`"1300-2000 caractères, photo en option"`**

### 3. Sous-mode LinkedIn "Carrousel texte" — ligne 402

- **Desc** : `"8-10 slides téléchargeables"` → **"8-10 slides, design auto, .pptx téléchargeable"** (préciser que c'est l'IA qui designe, comme pour le carrousel Instagram)

### 4. Sous-mode Pinterest "Texte" — ligne 429

- **Label** : `"Texte"` → **`"Texte SEO"`** (clarifie l'intention, distingue du "Visuel" qui a aussi du texte)

### 5. Sous-mode carrousel Instagram "Texte" — ligne 583

- **Desc** : `"L'IA rédige et designe"` → **"8-10 slides, design auto, .pptx téléchargeable"** (alignement avec LinkedIn carrousel texte, livrable explicite)

### 6. CONTENT_TYPE_SPECS.linkedin — `src/lib/content-structures.ts` ligne 521

- **`label`** : `"LinkedIn"` → **`"Post LinkedIn"`** (cohérence : c'est un format, pas un canal — `pinterest_visual` s'appelle "Épingle visuelle", pas "Pinterest")
- **`specs`** : `"1300-2000 caractères, ton professionnel"` → **`"1300-2000 caractères, ton incarné"`**
  - "Ton professionnel" contredit la voix LinkedIn de la mémoire projet (`preference/linkedin` : raw, sensoriel, anti-corporate). Champ utilisé en interne pour l'affichage des specs.

### 7. CONTENT_TYPE_SPECS.pinterest — ligne 535

- **`label`** : `"Pinterest"` → **`"Épingle texte"`** (alignement avec "Épingle visuelle" et "Inspiration Pinterest")

### Hors scope

- Pas de modification des `edgeFunction`, des `angles`, des structures éditoriales.
- Pas de changement du toggle photo des formats Instagram/LinkedIn/Newsletter (déjà cohérent).
- Le sous-mode `pinterest_inspiration` label = "Inspiration Pinterest" reste.

### Validation

- Écran de choix de canal : LinkedIn affiche "Post ou carrousel", Pinterest mentionne "inspirée", Newsletter précise les mots.
- Sous-mode LinkedIn : 3 cartes cohérentes (Post / Carrousel texte / Carrousel mixte) avec descriptions précises.
- Sous-mode Pinterest : "Texte SEO" / "Visuel" / "Inspiration".
- Sous-mode carrousel Instagram : descriptions des 3 modes (texte/photo/mixte) symétriques en niveau de détail.
- L'historique d'un contenu généré "linkedin" affiche désormais "Post LinkedIn" et non plus "LinkedIn" tout court.
- Carrousel chip replié (ligne 552 `Carrousel {label}`) reste cohérent : "Carrousel Texte / Photo / Mixte".
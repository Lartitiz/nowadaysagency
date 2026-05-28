# Audit — création de contenu à partir de photos

J'ai retracé tout le flow `Créer → Partir de photos → Format → Questions → Génération` et identifié 4 bugs (dont 2 critiques) qui expliquent ce que vit ta cliente.

---

## Bug #1 — Impossible de charger 2 photos pour un avant/après (CRITIQUE)

**Symptôme cliente** : "j'ai essayé de faire un avant/après mais je n'ai pu charger qu'une photo."

**Cause** : pour les formats *post Insta, post LinkedIn, reel, story, newsletter*, la zone d'upload est forcée à `maxPhotos={1}` (`CreerStepFormat.tsx` ligne 525). Il n'existe **aucun format "avant/après"** dans l'app — la seule façon d'uploader plusieurs photos est le **carrousel Instagram** (sous-mode photo ou mixte).

→ Sur **LinkedIn** en particulier, il n'y a aucun chemin pour faire un avant/après natif (le "carrousel LinkedIn" est un PDF de slides, pas une galerie photo). Oui, mais justement, sur LinkedIn, et ici, moi, j'aimerais que le carrousel LinkedIn puisse intégrer des photos. C'était ça l'objectif. 

**Correctif proposé** :

- Autoriser 2 photos sur le format `post LinkedIn` quand le toggle photo est activé (LinkedIn supporte nativement les multi-images).
- Ajouter une indication claire dans l'UI : "Pour un avant/après, uploade 2 photos" + petit hint visuel.
- Sur Instagram, rediriger explicitement vers le **carrousel photo** quand l'utilisatrice tente un 2ᵉ upload sur un post simple ("Tu veux 2 photos ? Passe en carrousel.").

---

## Bug #2 — La photo n'est pas utilisée par l'IA (CRITIQUE)

**Symptôme cliente** : "ça m'a généré du texte mais ça n'utilise pas la photo."

**3 causes possibles, toutes présentes dans le code** :

1. **Le toggle "📸 J'accompagne une photo" n'est pas activé.** Dans `CreerStepFormat.tsx` ligne 142, le toggle est auto-activé seulement à la **toute première sélection de format** après "Partir de photos". Si la cliente change ensuite de canal ou de format puis revient, `hasUserChangedFormat.current = true` → le toggle reste OFF, la photo reste affichée mais n'est **plus envoyée** à l'IA (la requête part sans `photo_mode: true`).
2. **Le chemin non-streaming pour LinkedIn perd la photo.** Dans `use-content-generator.ts` ligne 343-367 (case `"linkedin"`), aucun champ `photo_mode / photos / photo_description` n'est passé à l'edge function. Tout fallback hors-streaming génère donc du texte sans vision.
3. **Aucun feedback visuel ne confirme** que l'IA a "vu" la photo — donc l'utilisatrice ne sait jamais si elle a coché la bonne case.

**Correctif proposé** :

- Quand `uploadedPhotos.length > 0` et qu'on est sur un format compatible, **forcer `photoMode=true` par défaut** (au lieu de ne le faire qu'à la 1ère sélection). Si l'utilisatrice ne veut pas, elle décoche.
- Ajouter le bloc `photo_mode / photos / photo_description` dans le case `"linkedin"` de `use-content-generator.ts`.
- Afficher un **badge "✨ Généré à partir de ta photo"** sur la carte de résultat quand la photo a effectivement été envoyée à Claude (vision).
- Afficher un **avertissement explicite** si une photo est uploadée mais que le toggle est OFF : "⚠️ Ta photo n'est pas utilisée. Active le mode photo pour que l'IA la regarde."

---

## Bug #3 — UX mobile du toggle peu lisible

Sur mobile (et c'est probablement le cas de la cliente), le toggle "J'accompagne une photo" est :

- petit, dans un bloc gris discret,
- placé **au-dessus** de la zone d'upload (alors qu'on s'attend à uploader d'abord, puis confirmer),
- libellé pas évident ("J'accompagne une photo" = est-ce que je dois cocher si j'ai déjà uploadé ?).

**Correctif proposé** :

- Inverser l'ordre : zone d'upload d'abord, puis "L'IA va analyser cette photo : ✅ oui / texte uniquement" en mode segmenté plus visuel.
- Sur mobile, agrandir la zone tactile et passer en card cliquable plutôt qu'en switch.

---

## Bug #4 — LinkedIn carrousel multi-photos absent

Si la cliente veut publier sur **LinkedIn** un post avec 2+ photos (cas d'usage hyper courant : avant/après, comparatif, galerie produit), il n'y a aucun chemin produit. Le "carrousel LinkedIn" actuel est un export PDF de slides texte.

**Correctif proposé** (optionnel, plus gros chantier) : ajouter un sous-mode "LinkedIn carrousel photo" comme sur Instagram, qui génère juste la légende et laisse l'utilisatrice uploader nativement les photos sur LinkedIn.

---

## Périmètre du correctif que je propose d'implémenter

Si tu valides, je traite les **3 bugs critiques** (le #4 étant un chantier séparé à scoper) :

1. `CreerStepFormat.tsx` :
  - Passer `maxPhotos={2}` quand format = `linkedin` + photoMode ON (avant/après natif LinkedIn).
  - Auto-activer `photoMode` à chaque fois que `uploadedPhotos.length > 0` sur un format compatible (pas seulement à la 1ère sélection).
  - Ajouter le warning "⚠️ Ta photo n'est pas utilisée" si photo présente + toggle OFF.
2. `use-content-generator.ts` :
  - Ajouter `photo_mode / photos / photo_description` dans le case `"linkedin"` (fallback non-streaming).
3. `CreerStepResult.tsx` (ou équivalent) :
  - Badge "✨ Généré à partir de ta photo" quand la photo a été envoyée à l'IA.
4. UX mobile : déplacer le toggle **sous** la zone d'upload + rendre le libellé plus explicite.

---

## Détails techniques

```text
Flow actuel (résumé)
  WelcomePage / Dashboard
       │
       ▼
  CreerUnifie ──► CreerStepIdea ──"Partir de photos"──► PhotoUploadZone (max 10)
       │                                                       │
       │                                                       ▼
       │                                              uploadedPhotos[] + description
       ▼
  CreerStepFormat (initialPhotos prop)
       │
       ├─► Carousel Insta/LinkedIn : sub-mode photo/mix → uploadedPhotos[]   ✅ OK
       │
       └─► Post / Reel / Story / Newsletter / LinkedIn
              │
              ├─► toggle photoMode (auto-true 1ʳᵉ fois seulement)            ⚠️ BUG #2.1
              ├─► PhotoUploadZone maxPhotos={1}                              ⚠️ BUG #1
              └─► postPhoto[] (slice(0,1))

  doGenerate (CreerUnifie L786-810)
       │
       ├─► generateStream(... photoMode, photos[0] ...)  ──► creative-flow SSE
       │       └─► creative-flow L857 : streaming DÉSACTIVÉ si photo_mode  → fallback non-stream ✅
       │
       └─► (fallback) use-content-generator L343-366 case "linkedin"
               └─► AUCUN photo_mode/photos envoyé                            ⚠️ BUG #2.2
```

Estimation : 1 passe d'édition ciblée, ~6 fichiers touchés, pas de migration DB.

 sinon, ok pour tout, mais peut-être faire étape par étape pour rien casser 
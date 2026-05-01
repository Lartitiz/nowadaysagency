
# Plan — Refonte sous-flux carrousel dans `CreerStepFormat`

## Contexte

Sur `/creer`, quand l'utilisatrice choisit **Instagram → Carrousel → Mixte (avec photos)**, l'écran empile aujourd'hui jusqu'à 5 zones qui répètent la même information :

1. Bandeau "X photos déjà prêtes" (haut)
2. Chip canal "📸 Instagram"
3. Section "Quel type de carrousel ?" avec 3 grosses cartes Texte / Photo / Mixte
4. Bandeau "📸 X photos chargées — Carrousel mixte" (avec lien "Choisir un autre mode")
5. Titre interne "Vos photos (X)" dans la `PhotoUploadZone`
6. Encart en bas "Tu vas créer : 📸 Instagram · Carrousel (mixte) · …"

Résultat : l'utilisatrice scrolle, voit la même info 3 fois, ne sait plus où cliquer pour avancer.

Périmètre choisi : **tout le sous-flux carrousel** (les 3 sous-modes, Instagram + LinkedIn). Aucune logique métier modifiée — uniquement la présentation et la condition d'affichage de blocs déjà existants.

---

## Mes recommandations sur les 3 questions ouvertes

### 1. Sous-mode carrousel — je recommande "Replier dès qu'on a choisi" (option 3)

**Pourquoi pas fusionner Photo+Mixte (option 2) :** les deux modes produisent des sorties très différentes (10 slides photo plein écran vs 6-8 slides où tes photos sont entrelacées avec des slides de texte design). Si on fusionne, il faut quand même trancher après → on déplace juste le choix ailleurs. Et ton public cible (qui n'est pas tech) risque d'être déçu de découvrir ce choix après l'upload.

**Ce que je propose :** garder les 3 cartes Texte / Photo / Mixte tant qu'**aucun choix n'est fait**, puis remplacer tout le bloc par une **chip secondaire** ("✨ Mixte · Photos + slides texte" + petit lien "Changer") sous la chip canal. Une seule ligne, on voit l'état, on peut revenir si besoin.

### 2. Bandeaux photos — je recommande "Tout intégrer dans la PhotoUploadZone" (option 2)

**Pourquoi :** la `PhotoUploadZone` est déjà l'endroit où l'utilisatrice agit (upload, retire, légende). Y mettre l'état évite l'effet "je lis 3 fois la même phrase avant d'arriver à la zone d'action". Le bandeau "X photos déjà prêtes" en haut disparaît dès qu'un format compatible est choisi (il a juste servi à signaler "tes photos vont être utilisées" au moment du choix de format — son job est fini).

**Garde-fous :** pour le cas "format incompatible" (ex. user avec photos préchargées choisit "Story"), on garde le **bandeau d'avertissement ambré** existant (lignes 454-468) — c'est la seule alerte vraiment utile.

### 3. Encart "Tu vas créer : …" — je recommande "Le coller au CTA" (option 2)

**Pourquoi :** une fois qu'on a une chip canal + une chip sous-mode + une carte d'angle sélectionnée, l'utilisatrice voit déjà ses 3 choix dans la page. Mais juste avant d'appuyer "Suivant", **un récap explicite réduit l'angoisse "est-ce que j'ai bien tout choisi ?"** — surtout pour le persona "guidée". Le promouvoir en haut (option 3) ferait doublon avec la chip canal qui est déjà là.

---

## Changements concrets

### Fichier unique modifié : `src/components/creer/CreerStepFormat.tsx`

#### A. Bandeau "X photos déjà prêtes" en haut (lignes 280-287)

**Comportement actuel :** affiché tant que `!hasUserChangedFormat.current`.

**Nouveau comportement :** affiché uniquement quand **aucun canal n'est encore choisi** (`!selectedChannel`). Dès que le canal est choisi, le statut des photos vit dans la `PhotoUploadZone`. Évite la répétition.

#### B. Section "Quel type de carrousel ?" (lignes 537-581)

**Comportement actuel :** 3 cartes pleine largeur (Texte / Photo / Mixte), affichées tant que `carouselSubMode` n'est pas validé avec photos préchargées.

**Nouveau comportement :**
- **Tant que `carouselSubMode === null`** → affichage des 3 cartes (inchangé visuellement).
- **Dès que `carouselSubMode` est défini** → repli en **chip compacte** sous la chip canal :
  ```
  [✨ Mixte · Photos + slides texte    Changer]
  ```
  avec emoji + label court + sous-label + bouton "Changer" qui réinitialise `carouselSubMode` à `null`.

Cas spécial photos préchargées : la logique actuelle (lignes 515-534) qui auto-set `mix` est conservée, mais le bandeau "📸 X photos chargées — Carrousel mixte" est supprimé (l'info est dans la chip + dans la zone photos).

#### C. Bandeau de confirmation lignes 515-534 → supprimé

Sa fonction (montrer "tes photos sont prises en compte") est reprise par :
- la nouvelle chip sous-mode (qui dit "Mixte"),
- la `PhotoUploadZone` qui affiche elle-même "Vos photos (X)".

Le lien "Choisir un autre mode" est repris par le bouton "Changer" de la chip.

#### D. Confirmation single-photo lignes 482-498 → même traitement

Pour les formats `post / reel / story / linkedin / newsletter` avec photo préchargée + `photoMode === true`, on supprime le bandeau de confirmation et on s'appuie sur :
- le **toggle "📸 J'accompagne une photo"** déjà présent (lignes 471-479) qui reste affiché et indique l'état (la `Switch` est `checked`),
- la `PhotoUploadZone` en dessous qui affiche les photos.

Cohérence assurée entre carrousel et single-photo formats.

#### E. Encart "Tu vas créer : …" (lignes 738-746) → repositionné

**Comportement actuel :** rendu après tous les autres blocs, donc loin du CTA selon la longueur de la page.

**Nouveau comportement :** déplacé juste **au-dessus** du bouton "Suivant" (lignes 750-758). C'est déjà presque le cas — il faut juste s'assurer qu'aucun bloc ne s'intercale et faire un peu de breathing room (espacement vertical réduit).

#### F. PhotoUploadZone — propriété `compact` utilisée plus largement

Aujourd'hui `compact` est passé à `true` uniquement quand `(initialPhotos?.length ?? 0) > 0`. On élargit : `compact={true}` dès qu'un statut/chip est déjà visible plus haut dans la page (canal + sous-mode = chip déjà chargée → on évite un titre redondant).

---

## Ce qui ne change PAS

- Tous les handlers (`handleFormatSelect`, `handleChannelSelect`, `handleChangeChannel`, `handleNext`).
- Toute la logique de validation (guards `carouselSubMode required`, photos requises pour photo/mix, etc.).
- L'API du composant (`onNext` signature inchangée).
- Le composant `PhotoUploadZone` lui-même (aucune nouvelle prop).
- Les CONTENT_TYPE_SPECS et tout `lib/content-structures.ts`.
- Le parcours Pinterest, le bandeau "Newsjacking suggère X", le sélecteur d'angle éditorial.
- Tous les autres composants (`CreerStepIdea`, `CreerStepQuestions`, `CreerStepResult`, `CreerStepper`).
- Aucun changement backend / Edge Function.

---

## Critères de validation

1. Compte démo Auriana (carrousel mixte) :
   - Choisir Instagram → Carrousel → Mixte → uploader 3 photos.
   - **Vérifier** : la section "Quel type de carrousel ?" se replie en chip compacte dès le clic sur Mixte.
   - **Vérifier** : aucun bandeau "X photos chargées" ne s'affiche au-dessus de la zone photos.
   - **Vérifier** : on peut toujours revenir au choix Texte/Photo/Mixte via "Changer".
   - **Vérifier** : l'encart "Tu vas créer : …" est juste au-dessus du bouton "Suivant".

2. Compte démo Auriana scénario "auriana-carousel" (photos préchargées) :
   - Arriver sur l'étape Format avec 5 photos préchargées.
   - **Vérifier** : le bandeau "5 photos déjà prêtes" disparaît dès qu'Instagram → Carrousel est choisi.
   - **Vérifier** : la `PhotoUploadZone` s'affiche en mode compact.

3. Cas single-photo (Post + photo) :
   - Choisir Instagram → Post, activer le toggle "📸 J'accompagne une photo".
   - **Vérifier** : aucun bandeau redondant, la zone photo apparaît directement.

4. Cas LinkedIn carrousel mixte :
   - LinkedIn → Carrousel mixte → 4 photos.
   - **Vérifier** : même comportement, chip "✨ Mixte" visible, pas de bandeau "X photos chargées".

5. Cas non-régression : carrousel Texte (sans photos) → flow inchangé jusqu'au choix de l'angle.

6. `npx tsc --noEmit --skipLibCheck` passe.

---

## Hors scope

- Refonte visuelle des cartes d'angle éditorial (recommandées vs autres).
- Ajout d'animations / transitions entre les états repliés/dépliés.
- Audit du parcours `CreerStepQuestions` (étape 3) qui présente d'autres redites — plan séparé.
- Modification de `PhotoUploadZone` (autre composant, autre PR).

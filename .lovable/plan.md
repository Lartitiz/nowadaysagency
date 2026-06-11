# Afficher les photos dans la preview LinkedIn du calendrier

## Diagnostic

Dans `src/components/social-mockup/SocialMockup.tsx`, le composant `LinkedInMockup` (lignes 193-315) reçoit bien `mediaUrls` via les props partagées… mais il ne le destructure pas et ne l'affiche nulle part. Seul `InstagramMockup` rend les images (ligne 94). Résultat : un post LinkedIn avec photos n'a **aucun visuel** dans la preview du `CalendarPostDialog`.

Le reste de la chaîne est bon :
- `CalendarPostDialog.tsx:389` passe `mediaUrls={mediaUrls}` à `CalendarPostPreview`.
- `CalendarPostPreview.tsx:39-41` fait un fallback `mediaUrls || photoUrls` et le passe à `SocialMockup` (ligne 394).
- Le canal `linkedin` est bien routé vers `LinkedInMockup` (ligne 44).

Il manque juste le rendu côté LinkedIn.

## Changements

### Fichier unique : `src/components/social-mockup/SocialMockup.tsx`

1. Destructurer `mediaUrls` dans la signature de `LinkedInMockup` (ligne 193-196).
2. Ajouter un bloc média **entre la fin du header et le bloc caption** (place LinkedIn standard : image affichée juste sous l'auteur, en pleine largeur de la carte, AVANT ou après la caption — sur LinkedIn natif c'est après la caption, donc on suit ce pattern).
3. Layouts selon le nombre de photos (style LinkedIn natif) :
   - **1 photo** → `<img>` pleine largeur, `aspect-[4/5]` max, `object-cover`.
   - **2 photos** → grille 2 colonnes, chaque cellule carrée.
   - **3 photos** → 1 grande à gauche + 2 empilées à droite.
   - **4 photos ou plus** → grille 2×2 ; si >4, overlay `+N` sur la 4ᵉ tuile.
4. Afficher le bloc même en mode `compact` (c'est précisément en compact qu'on est dans le dialog → l'utilisatrice DOIT voir ses photos). En compact, garder la hauteur raisonnable (par ex. `max-h-64`).
5. Ne pas casser le cas "pas de photos" : si `mediaUrls` est vide/undef, ne rien afficher (pas de placeholder LinkedIn — c'est conforme au vrai LinkedIn pour les posts texte seul).

## Hors-scope (ne pas toucher)

- `InstagramMockup` : fonctionne déjà.
- `CalendarPostPreview` et `CalendarPostDialog` : la donnée arrive correctement, rien à changer.
- Carrousels LinkedIn (PDF/slides) : géré par un autre chemin (`slides` + `CarouselSlider`), pas concerné.
- Storage / RLS / DB : aucune modification.

## Validation

1. Ouvrir un post LinkedIn existant avec photos dans le calendrier → la preview live doit montrer les photos.
2. Tester avec 1, 2, 3, 4, 5 photos pour vérifier les layouts.
3. Tester avec 0 photo → preview texte seul, pas de bloc image vide.
4. Vérifier que la preview Instagram n'a pas régressé.

Tout petit changement, isolé à un fichier, zéro risque sur la logique métier.

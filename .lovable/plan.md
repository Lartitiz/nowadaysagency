

## Plan : Refaire les visuels pré-générés de la démo Auriana avec le vrai design system

### Problème
Les visuels HTML dans `getAurianaDemoVisualSlides()` sont ultra-basiques : texte centré sur fond uni, pas de cartes blanches, pas de badges pilules, pas de barres accent, pas de hiérarchie typographique. Le résultat ressemble à du PowerPoint 2003, alors que la vraie Edge Function `carousel-visual` génère du design riche avec le design system Nowadays.

### Solution
Réécrire entièrement le HTML de chaque slide dans `getAurianaDemoVisualSlides()` en utilisant la charte graphique d'Auriana (Montserrat/Open Sans, #1B3A4B/#D4A843/#C0392B/#F5F3EF/#2C2C2C) et les patterns du design system (cartes blanches avec ombre, badges pilules, barres accent latérales, centrage vertical flex, alternance de fonds).

### Fichier modifié
`src/lib/demo-auriana-data.ts` — un seul fichier

### Design par slide (8 slides)

1. **HOOK** (slide 1) : Fond #F5F3EF, grande carte blanche centrée avec ombre douce, titre 60px en Montserrat, mots-clés en #1B3A4B italic, badge pilule #1B3A4B en haut
2. **CONTEXTE** (slide 2) : Fond blanc, bordure pointillée #1B3A4B40, titre Montserrat 44px, corps Open Sans 30px
3. **EXPLICATION** (slide 3) : Fond blanc, badge pilule "MÉTHODE", barre accent latérale 4px #D4A843, liste avec flèches en #1B3A4B
4. **PREUVE** (slide 4) : Fond #1A1A1A (dark box), chiffre "80%" en 80px #D4A843, texte blanc
5. **OBJECTION** (slide 5) : Fond #F5F3EF, citation en bordure pointillée, réponse en carte blanche avec barre accent #C0392B
6. **RÉSULTATS** (slide 6) : Fond blanc, stats en gros chiffres #1B3A4B, badges pilules pour les résultats
7. **SYNTHÈSE** (slide 7) : Fond blanc, liste numérotée avec cercles #1B3A4B, barre accent latérale
8. **CTA** (slide 8) : Fond #F5F3EF, carte blanche centrée, texte CTA en Montserrat #1B3A4B, badge pilule "lien en bio"

### Principes appliqués
- Google Fonts Montserrat (titre, font-weight normal) + Open Sans (corps)
- Centrage vertical flex sur chaque slide (display:flex; justify-content:center; align-items:center; padding:60px 80px)
- Badges pilules (inline-block, background #1B3A4B, color white, border-radius 100px, uppercase, letter-spacing 2px)
- Cartes blanches (background #FFF, border-radius 16px, box-shadow 0 4px 24px rgba(0,0,0,0.06))
- Barres accent latérales (border-left: 4px solid)
- Alternance de fonds : blanc, #F5F3EF, 1 slide dark #1A1A1A
- Handle @auriana.mdb en bas à droite

### Ce qui ne change PAS
- La structure `AURIANA_DEMO_FLOW` (slides data, captions, hashtags)
- La fonction `demoSlideHtml` (inutilisée, peut rester)
- Le mécanisme de bypass dans `CreerUnifie.tsx`
- Tous les autres fichiers


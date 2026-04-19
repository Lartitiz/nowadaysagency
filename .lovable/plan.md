

## Plan : Repenser la Hero Card "Ta prochaine étape"

### Le problème actuel
La card est dense et un peu plate :
- L'icône à gauche + bloc texte à droite = lecture en zigzag
- Le titre, l'explication, le CTA et le lien secondaire s'enchaînent sans hiérarchie forte
- Le bouton "Je sais pas quoi poster" est discret au point qu'on ne le voit pas
- Pas de signal visuel de "valeur" : on ne sait pas pourquoi on cliquerait
- L'accent bar verticale gauche est subtile mais ne crée pas de désir

### La nouvelle direction : "card-poster" avec hiérarchie claire

```text
┌─────────────────────────────────────────────────┐
│  ✨ TA PROCHAINE ÉTAPE              [⏱ 5 min]   │  ← micro-header
│                                                  │
│  Crée ton prochain                               │  ← titre énorme,
│  contenu                                         │     2 lignes max
│                                                  │
│  Ta com' est bien calée. Le secret              │  ← explication
│  maintenant : la régularité.                     │     courte, aérée
│                                                  │
│  ┌───────────────────────────┐                  │
│  │  C'est parti  →           │  ← CTA gros,    │
│  └───────────────────────────┘     plein largeur│
│                                    sur mobile    │
│  ─────────────────────────────                  │  ← séparateur léger
│  🤔  Je sais pas quoi poster ?                  │  ← lien secondaire
│       On en discute →                            │     plus visible
└─────────────────────────────────────────────────┘
   ↑ fond légèrement gradient rose-pale → blanc
   ↑ bordure plus marquée au hover
```

### Les changements concrets

**1. Header de carte (nouvelle ligne)**
- À gauche : `✨ TA PROCHAINE ÉTAPE` en uppercase, petit, avec emoji intégré (au lieu de l'icône box)
- À droite : badge durée estimée (ex: `⏱ 5 min`) si dispo, sinon rien
- L'icône lourde de 46px disparaît → gain d'espace vertical

**2. Titre repensé**
- Passer de `text-xl` à `text-[26px] sm:text-3xl` 
- `font-display`, leading serré
- C'est LE point d'entrée visuel

**3. Explication condensée**
- Garder le markdown mais limiter visuellement à 2 lignes max
- Couleur `text-foreground/70` au lieu de `text-muted-foreground` (plus lisible)

**4. CTA principal**
- Pleine largeur sur mobile, auto sur desktop
- Plus haut (h-12), plus contrasté
- Garder bordeaux mais ajouter une vraie shadow au hover
- Flèche qui se déplace au hover (`group-hover:translate-x-1`)

**5. Lien secondaire "Je sais pas quoi poster"**
- Le séparer visuellement du CTA principal avec un divider léger
- Le rendre plus actionnable : icône + texte + flèche
- Format : `🤔 Je sais pas quoi poster ? · On en discute →`
- Couleur primary au survol

**6. Fond et finition**
- Léger gradient `from-rose-pale/40 to-card` (à peine perceptible, donne de la chaleur)
- Retirer la barre verticale d'accent (redondante avec le nouveau design)
- Garder le hover lift mais légèrement plus marqué (-translate-y-[3px])

**7. Bouton démo Auriana**
- Le déplacer en bas, sous le séparateur, dans un style cohérent (pas de couleur primary qui vole la vedette au CTA principal)

### Fichier modifié
- `src/pages/AdaptiveHome.tsx` (lignes 232-281 uniquement)

### Ce qui ne change pas
- La logique (`recommendation`, `handleNavigate`, `setContentCoachingOpen`)
- Le hook `useDailyRecommendation`
- Le composant `RecommendationIcon` (juste plus utilisé ici, gardé pour ailleurs)
- La grille des mini-cards en dessous
- Le scénario démo Auriana (juste restylé)

### Résultat attendu
Une card qui se lit en 1 seconde : œil → titre énorme → CTA évident. Le "Je sais pas quoi poster" devient une vraie alternative visible au lieu d'un lien perdu.


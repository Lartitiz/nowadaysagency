## Problème

Dans `ContentCoachingDialog.tsx` (lignes 424-427), le champ `idea.angle` est rendu comme un **pill rose en majuscules, tracking étendu, `rounded-full`**. Comme l'IA renvoie en réalité un paragraphe descriptif long (la "tension" complète), on obtient un énorme blob rose qui occupe la moitié de la carte et devient illisible.

```
┌──────────────────────────────┐
│ Titre de l'idée              │
│                              │
│ ╭──── PILL ROSE GÉANT ─────╮ │
│ │ DANS LE MILIEU DE LA COM'│ │
│ │ ÉTHIQUE, ON RÉPÈTE...    │ │  ← problème
│ │ ...TENSION : LIVRER DU.. │ │
│ ╰──────────────────────────╯ │
│ 🔥 Audacieux  👀 visibilite  │
└──────────────────────────────┘
```

## Solution (UI uniquement, frontend)

Traiter `idea.angle` comme **du texte descriptif**, pas comme un tag :

1. Le sortir de la rangée de pills (lignes 424-443).
2. L'afficher juste sous le titre, dans un petit bloc de texte :
   - Casse normale (pas d'`uppercase`, pas de `tracking-wider`)
   - Couleur `text-muted-foreground`
   - Taille `text-xs` ou `text-[11px]`, `leading-relaxed`
   - `line-clamp-3` quand la carte n'est pas sélectionnée → expansion complète quand `isSelected`
   - Pas de fond rose plein : soit aucun fond, soit un `border-l-2 border-primary/40 pl-2` discret pour garder une touche de couleur sans dominer la carte.
3. Garder uniquement les vraies pills courtes dans la rangée du bas : `boldness` (🔥/💥/🌱) + `objective_tag` (👀/🤝/💰/🎓) + le lien "Voir le détail →".
4. `why_it_works` (visible quand sélectionné) reste tel quel.

## Résultat attendu

```
┌──────────────────────────────┐
│ Titre de l'idée              │
│ │ Dans le milieu de la com'  │
│ │ éthique, on répète... (3l) │  ← texte sobre, line-clamp
│                              │
│ 🔥 Audacieux  👀 visibilité  │
│                Voir le détail│
└──────────────────────────────┘
```

## Fichier touché

- `src/components/dashboard/ContentCoachingDialog.tsx` — uniquement le bloc de rendu d'une `idea` (≈ lignes 411-450). Aucun changement backend, prompt ou typage.

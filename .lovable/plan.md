## Objectif
Ajouter une petite note douce et éducative dans le panel Newsjacking (état "idle", avant lancement), juste au-dessus du bouton **Lancer la recherche**, pour rassurer l'utilisateur : parfois une actu semble hors sujet, mais c'est justement le lien inattendu qui crée l'impact.

## Emplacement technique
`src/components/creer/NewsjackingPanel.tsx`, ligne ~447, dans le bloc `!started && !loading` (idle state), juste avant le `<div className="flex justify-center">` qui contient le bouton.

## Variantes de texte proposées

**A — Le secret (ton mystérieux/invitant)**
```
Petit secret : l'actu qui semble n'avoir aucun rapport avec ta marque est souvent celle qui surprend le plus. C'est le lien inattendu qui crée l'impact.
```

**B — La promesse (ton rassurant)**
```
Petit secret : pas besoin que l'actu soit "dans ton secteur". Ce qui compte, c'est le lien que tu crées. Et souvent, c'est l'angle inattendu qui marque le plus.
```

**C — L'invitation à la confiance (ton doux/encourageant)**
```
Petit secret : l'IA cherche aussi l'angle inattendu. L'actu qui semble loin de ta marque peut devenir ton meilleur rebond — c'est le lien créatif qui fait la différence.
```

## Mise en forme
- Encart visuel : petite bulle/info-bande avec fond légèrement teinté (`bg-primary/5` ou `bg-muted/40`), texte en `text-xs text-muted-foreground`, possiblement avec une petite icône `Lightbulb` ou `Sparkles`.
- Pas de bordure forte, pas d'animation — juste une note discrète et chaleureuse.

## Validation
- Vérifier le rendu visuel dans le panel Newsjacking en mode idle.
- S'assurer que l'espacement (`space-y-5` du parent) reste cohérent.
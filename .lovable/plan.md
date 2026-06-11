# Refonte modale détail d'idée — direction "Focus éditorial"

## Ce qui change visuellement

Aujourd'hui le `DialogTitle` reçoit le champ `titre` qui peut être un paragraphe entier → il s'affiche en H1 énorme et écrase tout. La nouvelle hiérarchie traite l'idée comme **corps éditorial** et fait remonter le scan rapide (badges, méta) + isole les notes perso comme zone d'écriture distincte + colle les actions en footer.

Ordre vertical dans la modale :
1. **Header sticky-top** : ligne de badges (statut cliquable, canal, objectif, type) à gauche + bouton fermer à droite.
2. **L'idée** (corps) : le champ `titre` rendu en `font-display`, taille `text-xl md:text-2xl`, `leading-relaxed`, sans label "MES NOTES"-style — c'est le focal point.
3. **Accroche** (conditionnel) : si `accroche_short` ou `accroche_long`, sous-bloc avec label mono uppercase "ACCROCHE" + texte body, séparé par border-top léger.
4. **Contenu** (conditionnel) : même pattern label mono uppercase "CONTENU", garde le `ContentPreview` existant dans son fond `bg-rose-pale rounded-xl`.
5. **Méta** : grille 2 colonnes (Angle / Format / Format technique / Création / Modifiée / Planifiée), labels en `font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground`, valeurs en `text-sm text-foreground`.
6. **Mes notes** : bloc tinté `bg-rose-pale/40 border-l-4 border-primary/40 rounded-r-lg p-5`, label mono uppercase à gauche, lien "Sauvegarder" mono uppercase à droite, textarea bg-transparent sans bord visible.
7. **Footer sticky-bottom** (`border-t bg-background`) : "Continuer la rédaction" en bouton primary plein-largeur, puis ligne `flex gap-3` avec "Planifier" (outline flex-1) + icône poubelle (ghost, hover destructive) qui déclenche l'AlertDialog de suppression existant.

## Fichier touché

- `src/pages/IdeasPage.tsx`, uniquement le bloc `<Dialog open={!!selectedIdea}>` (lignes ~441-575). Aucune autre page ni composant impacté.

## Tokens utilisés (charte existante)

- Typo titre/idée : `font-display`
- Labels uppercase : `font-mono-ui text-[10px] uppercase tracking-wider text-muted-foreground`
- Fond notes : `bg-rose-pale/40` + `border-l-4 border-primary/40`
- Bouton primary : `Button` shadcn variant par défaut (rose primary du projet) — pas de hex codé en dur
- Bouton supprimer : `Button variant="ghost" size="icon"` avec `text-muted-foreground hover:text-destructive`
- Aucune nouvelle couleur, aucune nouvelle police, aucune dépendance ajoutée

## Comportement / fonctionnalités

Strictement identique :
- `StatusDropdown` reste accroché au badge statut.
- `PlanifierPopover` continue d'envelopper le bouton "Planifier".
- L'`AlertDialog` de suppression reste branché sur l'icône poubelle.
- Le textarea de notes garde `detailNotes` + `handleSaveNotes`.
- `ContentPreview` éditable inchangé.
- `DialogTitle` est conservé en `sr-only` (accessibilité) avec une string courte type "Détail de l'idée".

## Hors scope

- Pas de modification des cartes d'idées dans la liste.
- Pas de refonte de la `CalendarIdeasSidebar` ni du `IdeaDetailSheet` du calendrier (composants distincts).
- Pas d'ajout de tabs / nouvelles actions / suggestions IA.
- Pas de touche à la logique de sauvegarde, planification, suppression.

## Validation

- `npx tsc --noEmit` clean.
- Test manuel : ouvrir une idée longue → l'idée se lit comme un paragraphe éditorial, les badges sont en tête, les méta scannables en grille, notes isolées, footer toujours visible.
- Test idée avec accroche + content_data (carrousel) : les sections Accroche / Contenu restent fonctionnelles dans le nouveau rythme.

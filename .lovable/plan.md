## (a) Implémentation demandée — Cartes Boîte à idées : aperçu scannable

### Scope

UNIQUEMENT le bloc de rendu d'une carte dans la liste (`filtered.map`) dans `src/pages/IdeasPage.tsx` (~lignes 379-390 et lignes 374-377). Aucun autre fichier.

### Changements

1. **Remplacer le bloc Preview dans la carte de liste**
  - Localiser la zone actuelle (lignes ~379-390) qui rend `<ContentPreview>` avec `compact` pour `content_data` ou `content_draft`.
  - Supprimer ces deux branches `<ContentPreview>`.
  - Les remplacer par un unique bloc qui extrait un texte d'aperçu dans cet ordre :
    - **a.** `idea.accroche_short` existe → afficher `🎣 {idea.accroche_short}`
    - **b.** sinon `idea.content_draft` existe → en extraire le texte brut, nettoyer les préfixes type `SLIDE 1 [📸]:` / `SLIDE 2 [📝]:` (conserver uniquement la phrase qui suit), puis afficher le début
    - **c.** sinon → ne rien afficher
  - Le texte résultant est rendu dans un `<p>` avec les classes : `text-[13px] text-foreground/70 line-clamp-2 mt-2`
  - Le `line-clamp-2` garantit un aperçu de 2 lignes max avec ellipse propre.
2. **Conditionner les métadonnées Angle / Format**
  - Lignes ~376-377 : entourer `<p>Angle : {idea.angle}</p>` d'une condition `idea.angle?.trim()`.
  - Entourer `<p>Format : {idea.format}</p>` d'une condition `idea.format?.trim()`.
  - Si la valeur est vide, la ligne ne s'affiche pas du tout.
3. **Invariants (strictement inchangés)**
  - `ContentPreview.tsx` : aucune modification.
  - Le panneau de détail (`Dialog` à partir de ~ligne 448) : aucune modification, il continue d'afficher `<ContentPreview>` complet au clic sur la carte.
  - Badges (statut, objectif, canal, brief) : inchangés.
  - Boutons d'action (Rédiger, Planifier, Supprimer, Créer à partir du brief) : inchangés.
  - Ligne "Créée le …" + date planifiée : inchangée.
  - Toute la logique de filtres, tri, fetch, handlers : inchangée.
  - Aucun import Supabase, aucune requête, aucune config touchée.

## (b) Propositions d'amélioration (à valider séparément)

1. **Helper `cleanSlideMarkers ok**`
  - Extraire une petite fonction locale dans `IdeasPage.tsx` (pas de nouveau fichier) pour nettoyer les marqueurs SLIDE :
  - Avantage : évite la duplication si un autre endroit veut le même nettoyage, et rend la transformation explicite.
  - Si tu préfères l'inline dans le JSX, c'est aussi faisable.
2. **Gestion du** `content_data` **comme fallback texte ok**
  - Le plan demande de ne plus utiliser `content_data` dans la carte. J'ai identifié que certains carrousels générés stockent les slides dans `content_data` (et pas dans `content_draft`). Si une idée n'a ni `accroche_short` ni `content_draft` mais a un `content_data.carousel.caption` ou `.hook_text`, on pourrait en piocher un texte. Cependant, cela réintroduit une dépendance à `content_data` dans la carte, ce que le plan demande d'éviter. Je ne l'implémente donc PAS sauf si tu le demandes explicitement.

## Validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Carte carrousel avec long brouillon : max 2 lignes d'aperçu texte, plus de rendu complet des slides.
- Clic sur carte : ouvre le détail avec `<ContentPreview>` complet comme avant.
- Lignes Angle/Format vides absentes.

## Hors scope

- Replier les filtres derrière un bouton "Filtres" (chantier B).
- Nettoyer les badges redondants (chantier C).
- Modification de `ContentPreview.tsx`.
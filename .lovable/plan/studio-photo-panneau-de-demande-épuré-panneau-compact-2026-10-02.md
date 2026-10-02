# Studio photo — panneau de demande épuré (« Panneau compact »)

## Problème
Au-dessus du champ de saisie du Studio photo, deux rangées de liens se cumulent :
« Références (2) », « Avant / après », « Mockup d'offre », « Image sélectionnée · changer × »,
« Nouvelle demande ». Ça charge la lecture du chat.

## Direction choisie
Maquette « Panneau compact » (v1) : une seule rangée d'outils compacte au-dessus du champ,
sélection visible sous forme de pastille, actions secondaires regroupées dans un menu « Options ».
Palette et typos inchangées (fond blanc, gris neutres, bordeaux #91014b via les tokens existants).

## Contenu après simplification

```text
┌──────────────────────────────────────────────┐
│ [+ Références · 2]  [Options ⌄]   (● Image sélectionnée ×) │   ← 1 rangée
│ ▸ Photos de cette demande (2)                 │   ← accordéon, replié par défaut
│   [miniatures existantes, inchangées]         │
│ ┌──────────────────────────────────────────┐ │
│ │ Ta demande…                              │ │   ← champ inchangé
│ └──────────────────────────────────────────┘ │
│ [🖼] [📚]                        ( Envoyer ) │   ← icônes + bouton bordeaux
└──────────────────────────────────────────────┘
```

- **« Références »** (icône +) : ouvre le panneau outils existant ; affiche le nombre de
  références (badge), libellé « Outils et créations » quand il n'y en a pas (comportement actuel).
- **« Options »** : petit menu déroulant regroupant les actions secondaires :
  Avant / après · Mockup d'offre · Nouvelle demande (avec aria-label
  « Nouvelle demande sans ces références » conservé). Mêmes états désactivés qu'aujourd'hui.
- **Pastille de sélection** (à droite, seulement si une image est sélectionnée) :
  point bordeaux + « Image sélectionnée » + × qui vide la sélection (même action qu'aujourd'hui).
- **Accordéon « Photos de cette demande »** : conservé (composant ReferenceCards intact),
  en-tête restylé en petites capitales discrètes ; reste ouvert quand des photos viennent
  d'être ajoutées (état photosOpen inchangé).
- **Importer / Bibliothèque** : deviennent deux boutons icône discrets (les aria-labels
  « Ajouter des images » et « Depuis ma bibliothèque » sont conservés), l'input caché
  « Importer plusieurs images » ne bouge pas.
- **Envoyer** : bouton bordeaux arrondi (pilule), inchangé fonctionnellement.
- Le bloc « Les références ont changé… » (activeBranchChoice) reste tel quel.

## Fichiers modifiés
1. `src/pages/VisualStudioPage.tsx` — remplacer les deux `.studio-link-row` (lignes ~1532-1553)
   par la rangée d'outils unique + menu Options + pastille ; passer Importer/Bibliothèque en
   icônes ; rien d'autre dans le fichier.
2. `src/features/visual-studio/studio.css` — styles `.studio-toolbar`, `.studio-toolbar-btn`,
   `.studio-selection-pill`, en-tête d'accordéon en petites capitales ; uniquement des tokens
   existants (`--primary`, `--muted-foreground`, `--border`), aucune couleur en dur.
3. `src/test/visual-studio.test.tsx` — ajuster le test qui clique
   « Nouvelle demande sans ces références » pour ouvrir d'abord le menu Options ; adapter
   tout autre sélecteur sur les libellés déplacés.

## Garde-fous
- Aucune fonctionnalité supprimée ni déplacée vers un autre écran : tout reste atteignable
  depuis le panneau.
- Le comportement mobile et desktop reste partagé (même bloc de code).
- Pas de changement backend, pas de génération, pas de déploiement de fonction.
- Vérification : `tsc --noEmit -p tsconfig.app.json`, tests `visual-studio.test.tsx`,
  puis capture Playwright du panneau pour contrôler le rendu.

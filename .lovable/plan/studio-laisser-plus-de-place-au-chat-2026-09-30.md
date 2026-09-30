# Studio : laisser plus de place au chat

But : que la conversation occupe la plus grande partie de la colonne de gauche. Les outils restent accessibles sous forme de petits liens texte discrets, sans boutons épais.

## Ce qui change

1. **Haut de page condensé en une seule ligne** (environ 190 px aujourd'hui, 48 px après)
   - « ← Bibliothèque » · « Studio visuel » · onglets « Photos | Clips vidéo » en petits liens soulignés · à droite, « Mes sessions » en lien.
   - Le nom de l'espace de travail (« Laetitia ») passe dans le menu ou disparaît de cet en-tête.
   - Les grosses pilules « Photos / Clips vidéo » sont remplacées par des onglets texte fins.

2. **« Autres outils et créations enregistrées » sort du fil du chat**
   - Il est remplacé par une rangée de petits liens au-dessus du champ de saisie : « Références (2) · Avant / après · Mockup d'offre · Compositions · Mémoire ».
   - Chaque lien ouvre son contenu dans un panneau latéral qui se superpose au chat : la hauteur du chat ne bouge plus.
   - Toutes les fonctions actuelles sont conservées (rôles des photos, retrait, charte, compositions, historique).

3. **Zone de saisie allégée**
   - « Ta demande » (libellé visible, doublon) est retiré ; « Nouvelle demande » devient un petit lien sur la même ligne que « À partir de l'image sélectionnée · changer ×».
   - « Photos de cette demande (2) ▸ » reste l'accordéon replié déjà en place, aligné sur cette même ligne de liens.

```text
← Bibliothèque  Studio visuel   Photos | Clips vidéo        Mes sessions
------------------------------------------------------------------------
| Studio : message…                      |  Images créées…
| (chat beaucoup plus haut)              |
| Références (2) · Avant/après · Mockup · Compositions                    |
| Image sélectionnée · changer × · Nouvelle demande · Photos (2) ▸        |
| [ Une idée, une question…          ] [Envoyer]                          |
```

## Hypothèse à corriger si besoin
Par « plein de liens », je comprends de petits liens texte (comme « changer de point de départ × ») à la place des blocs et des gros boutons.

## Détails techniques
- `src/pages/VisualStudioPage.tsx` : fusion du header et de la nav des onglets ; le `<details className="studio-extra-tools">` est déplacé dans un `Sheet` (shadcn) ouvert par une rangée de liens dans `studio-composer` ; retrait du libellé visible « Ta demande » (le `label` sr-only est conservé).
- `src/features/visual-studio/studio.css` : styles `.studio-header` compact, onglets texte, rangée de liens (tokens existants uniquement).
- Aucune modification de la logique, des données ou des fonctions serveur. L'onglet « Clips vidéo » profite du même en-tête compact.
- Vérification dans l'aperçu à 1074×700 : hauteur visible du chat avant et après, ouverture de chaque lien, aucune fonction perdue.

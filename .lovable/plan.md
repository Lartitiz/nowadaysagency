# Nouveau post : montrer la suite dès que le sujet est rempli

## Le problème

Quand tu ouvres un nouveau post dans le calendrier et que tu tapes le thème/sujet, rien n'apparaît en dessous : pas de bloc « Contenu », pas de bouton « Rédiger avec l'IA ». Le seul bouton actif est « Options » en bas, qui ne dit pas comment créer le contenu.

Raison technique confirmée : le bloc contenu (`CalendarPostContent`) sort immédiatement (`return null`) tant qu'il n'y a pas de `editingPost`, c'est-à-dire tant qu'on n'a pas rouvert un post déjà existant — même si le post vient d'être auto-enregistré.

## Ce qu'on change

Dès que le sujet est rempli, le bloc « ✍️ Contenu » s'affiche aussi pour un nouveau post, avec l'état vide déjà prévu :

- « Pas encore de contenu. »
- bouton principal « ✨ Rédiger avec l'IA »
- lien secondaire « ou écrire moi-même »
- l'astuce « 💡 Choisis un angle pour un meilleur résultat » si aucun angle

Les actions qui n'ont de sens que sur un post déjà généré (voir les slides, télécharger les visuels, générer les visuels, nouvelle version IA sur contenu existant) restent conditionnées à l'existence du post et de son contenu — elles n'apparaissent pas sur un post neuf.

Petit renfort de lisibilité : le texte de bas de page « Ajoute un sujet pour commencer » devient, une fois le sujet saisi, la mention d'enregistrement automatique déjà existante — inchangé, mais du coup l'utilisatrice voit bien que la suite est plus haut.

## Détails techniques

- `src/components/calendar/CalendarPostContent.tsx` : remplacer `if (!editingPost || !theme.trim()) return null;` par une garde sur le seul sujet (`if (!theme.trim()) return null;`), et sécuriser les accès à `editingPost` (`editingPost?.generated_content_id`, `VisualActions` déjà basé sur `story_sequence_detail` → renvoie `null` sans post).
- `src/components/calendar/CalendarPostDialog.tsx` : aucun changement de logique de génération. `handleSmartGenerate` vérifie déjà `theme.trim()` et l'auto-save crée l'enregistrement (`createdIdRef`), donc la génération depuis un post neuf fonctionne.

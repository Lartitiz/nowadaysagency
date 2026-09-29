# Rendre la séparation chat / images toujours visible dans le Studio

## Constat

La poignée qui permet de glisser la séparation entre la conversation et les images créées existe déjà et fonctionne (glisser pour ajuster, double-clic pour réinitialiser, flèches clavier gauche/droite). Le problème est purement visuel : au repos, la fine ligne centrale est transparente — on ne voit qu'une bordure grise très pâle — donc impossible de deviner qu'on peut la tirer.

## Ce qui change

Dans `src/features/visual-studio/studio.css`, uniquement le style de `.studio-resizer` :

- La fine ligne verticale devient visible en permanence : rose pâle au repos (par exemple `hsl(var(--primary) / 0.35)`), rose franc au survol et pendant le glissement, comme aujourd'hui.
- Le curseur « redimensionner » reste affiché au survol, et le titre d'aide (« Glisser pour élargir la conversation · double-clic pour réinitialiser ») est conservé.
- Aucun changement de comportement : glisser, double-clic, clavier, mémorisation de la largeur — tout reste identique.

## Vérifications

- Aperçu (session connectée, 982 px de large) : la ligne rose est visible sans survol, s'intensifie au survol, et le glissement ajuste bien la largeur du chat.
- Compilation TypeScript sans erreur.

Le frontend ne sera pas publié.
